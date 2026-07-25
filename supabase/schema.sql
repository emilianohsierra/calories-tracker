-- =============================================================================
-- calories-tracker · Paso C v2 · Auth + Contador + Rate-limit (freemium)
-- Pegar TODO este archivo en: Supabase Dashboard → SQL Editor → Run.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Incorpora los fixes NO NEGOCIABLES de la auditoría QA (plan/C-qa-hallazgos.md):
--   H6  RLS: el cliente SOLO puede SELECT sus propias filas; NUNCA mutar el contador.
--            La única mutación viene de las funciones SECURITY DEFINER de abajo.
--   H7  DEFINER: SET search_path='' , usuario derivado de auth.uid() interno (no por
--            parámetro), y chequeo+incremento en UNA sola sentencia atómica.
--   H9  Reembolso: GREATEST(count-1,0), scoped al MISMO periodo que reservó
--            (vía ledger usage_events), idempotente por request_id.
--   H4  Airbag: contador GLOBAL mensual + tope duro configurable + kill-switch.
--   H19 Freemium: el límite lo resuelve la función leyendo profiles.plan; free vs
--            premium (ilimitado). El registro MANUAL de comida NO pasa por aquí.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) TABLAS
-- -----------------------------------------------------------------------------

-- Perfil por usuario. El plan controla el límite; el usuario NO puede cambiarlo.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  plan       text not null default 'free' check (plan in ('free', 'premium')),
  created_at timestamptz not null default now()
);

-- Contador de análisis de IA por usuario y periodo mensual (llave 'YYYY-MM').
-- El reset mensual es implícito: al cambiar de mes cambia la llave y arranca en 0.
create table if not exists public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  period  text not null,                 -- 'YYYY-MM' (zona America/Mexico_City)
  count   int  not null default 0,
  primary key (user_id, period)
);

-- Airbag (H4): contador GLOBAL mensual agregado de TODA la base.
create table if not exists public.global_usage (
  period text primary key,               -- 'YYYY-MM'
  count  int  not null default 0
);

-- Configuración server-side. Fuente de verdad de la aplicación de límites.
-- El cliente NO puede leerla ni pasarla (ver RLS abajo) → no se puede falsificar (H6c).
-- Fila única forzada por la PK booleana.
create table if not exists public.app_config (
  id                boolean primary key default true check (id),
  free_limit        int     not null default 10,    -- análisis IA/mes plan free
  global_monthly_cap int    not null default 5000,  -- tope duro global/mes (airbag)
  kill_switch       boolean not null default false, -- true = bloquea TODA la IA al instante
  updated_at        timestamptz not null default now()
);

-- Ledger de idempotencia (H9): una fila por request de análisis. Permite que el
-- reembolso sea idempotente y quede scoped al periodo exacto de la reserva.
create table if not exists public.usage_events (
  request_id uuid primary key,           -- generado por la ruta (crypto.randomUUID())
  user_id    uuid not null references auth.users (id) on delete cascade,
  period     text not null,
  refunded   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Sembrar la fila única de configuración (no la pisa si ya existe).
insert into public.app_config (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 2) ALTA AUTOMÁTICA DE PERFIL AL REGISTRARSE
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, plan) values (new.id, 'free')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3) RLS (H6): SELECT propio permitido; INSERT/UPDATE/DELETE DENEGADO al usuario.
--     global_usage, app_config y usage_events: sin acceso alguno para el cliente.
-- -----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.usage_counters enable row level security;
alter table public.global_usage   enable row level security;
alter table public.app_config     enable row level security;
alter table public.usage_events   enable row level security;

-- profiles: solo lectura de la propia fila (así la UI puede saber el plan).
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));
-- Sin políticas de INSERT/UPDATE/DELETE ⇒ denegado (no self-upgrade de plan, H6b).

-- usage_counters: solo lectura de las propias filas (para mostrar "restantes").
drop policy if exists usage_counters_select_own on public.usage_counters;
create policy usage_counters_select_own on public.usage_counters
  for select to authenticated
  using (user_id = (select auth.uid()));
-- Sin políticas de mutación ⇒ el usuario NO puede resetear su contador (H6a).

-- global_usage / app_config / usage_events: RLS activa y SIN políticas ⇒ el rol
-- authenticated/anon no ve ni toca nada. Solo las funciones DEFINER (owner) acceden.

-- Blindaje de privilegios de tabla (por si Supabase otorgó grants por defecto):
revoke all on public.global_usage, public.app_config, public.usage_events
  from anon, authenticated;
revoke all on public.profiles, public.usage_counters from anon;
grant select on public.profiles, public.usage_counters to authenticated;

-- -----------------------------------------------------------------------------
-- 4) consumir_analisis(request_id): reserva 1 crédito de IA de forma atómica.
--     - Usuario derivado de auth.uid() interno (NO por parámetro) — H7.
--     - Límite resuelto adentro leyendo profiles.plan + app_config — H6c ignora
--       cualquier argumento de límite del cliente (no existe tal argumento).
--     - Chequeo + incremento en UNA sentencia por-usuario y otra global — H7.
--     - Idempotente por request_id (ledger usage_events).
--     Devuelve jsonb: { allowed, reason, period, remaining }.
-- -----------------------------------------------------------------------------
create or replace function public.consumir_analisis(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_period       text;
  v_plan         text;
  v_free_limit   int;
  v_global_cap   int;
  v_kill         boolean;
  v_limit        int;          -- null = ilimitado (premium)
  v_user_count   int;
  v_global_count int;
  v_existing     public.usage_events%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_auth');
  end if;

  -- Periodo mensual en zona fija del mercado (evita ambigüedad de timezone, H13).
  v_period := to_char((now() at time zone 'America/Mexico_City'), 'YYYY-MM');

  -- Idempotencia: si este request ya se contabilizó, no re-incrementar.
  select * into v_existing from public.usage_events where request_id = p_request_id;
  if found then
    return jsonb_build_object('allowed', true, 'reason', 'idempotent_replay',
                              'period', v_existing.period, 'remaining', null);
  end if;

  -- Configuración server-side (el cliente no puede leerla ni falsificarla).
  select free_limit, global_monthly_cap, kill_switch
    into v_free_limit, v_global_cap, v_kill
    from public.app_config where id = true;

  if coalesce(v_kill, false) then
    return jsonb_build_object('allowed', false, 'reason', 'kill_switch', 'period', v_period);
  end if;

  -- Límite por plan, leído INTERNAMENTE (H6): premium = ilimitado; free = app_config.
  select plan into v_plan from public.profiles where id = v_uid;
  if v_plan = 'premium' then
    v_limit := null;
  else
    v_limit := v_free_limit;
  end if;

  if v_limit is not null and v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'user_limit',
                              'period', v_period, 'remaining', 0);
  end if;

  -- Reserva por-usuario: chequeo + incremento atómico (H7). Sin read-then-write.
  insert into public.usage_counters (user_id, period, count)
  values (v_uid, v_period, 1)
  on conflict (user_id, period) do update
    set count = public.usage_counters.count + 1
    where (v_limit is null or public.usage_counters.count < v_limit)
  returning count into v_user_count;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'user_limit',
                              'period', v_period, 'remaining', 0);
  end if;

  -- Reserva global (airbag): chequeo + incremento atómico.
  insert into public.global_usage (period, count)
  values (v_period, 1)
  on conflict (period) do update
    set count = public.global_usage.count + 1
    where (v_global_cap is null or public.global_usage.count < v_global_cap)
  returning count into v_global_count;

  if not found then
    -- Tope global alcanzado: liberar la reserva por-usuario para no cobrar de más.
    update public.usage_counters
      set count = greatest(count - 1, 0)
      where user_id = v_uid and period = v_period;
    return jsonb_build_object('allowed', false, 'reason', 'global_cap', 'period', v_period);
  end if;

  -- Registrar el evento (ledger para el reembolso idempotente).
  insert into public.usage_events (request_id, user_id, period)
  values (p_request_id, v_uid, v_period);

  return jsonb_build_object(
    'allowed', true,
    'reason', 'ok',
    'period', v_period,
    'remaining', case when v_limit is null then null else v_limit - v_user_count end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) reembolsar_analisis(request_id): devuelve el crédito SOLO si la ruta lo pide
--     (fallo de sistema PRE-facturación; ver H1 en el doc). GREATEST(count-1,0),
--     scoped al periodo guardado en el ledger, idempotente por request_id (H9).
--     Devuelve jsonb: { refunded, reason, period }.
-- -----------------------------------------------------------------------------
create or replace function public.reembolsar_analisis(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ev  public.usage_events%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('refunded', false, 'reason', 'no_auth');
  end if;

  -- Lock de la fila del ledger: serializa reembolsos concurrentes (evita underflow).
  select * into v_ev
    from public.usage_events
    where request_id = p_request_id and user_id = v_uid
    for update;

  if not found then
    return jsonb_build_object('refunded', false, 'reason', 'not_found');
  end if;
  if v_ev.refunded then
    return jsonb_build_object('refunded', false, 'reason', 'already_refunded');
  end if;

  update public.usage_counters set count = greatest(count - 1, 0)
    where user_id = v_uid and period = v_ev.period;
  update public.global_usage set count = greatest(count - 1, 0)
    where period = v_ev.period;
  update public.usage_events set refunded = true
    where request_id = p_request_id;

  return jsonb_build_object('refunded', true, 'period', v_ev.period);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) PERMISOS DE EJECUCIÓN: solo el usuario autenticado; nunca anon/público.
-- -----------------------------------------------------------------------------
revoke execute on function public.consumir_analisis(uuid)   from public, anon;
revoke execute on function public.reembolsar_analisis(uuid) from public, anon;
grant  execute on function public.consumir_analisis(uuid)   to authenticated;
grant  execute on function public.reembolsar_analisis(uuid) to authenticated;

-- =============================================================================
-- OPERACIÓN (para Emiliano/operador; correr según necesidad):
--   Cambiar el límite free:   update public.app_config set free_limit = 30;
--   Subir el airbag global:   update public.app_config set global_monthly_cap = 20000;
--   KILL-SWITCH (apagar IA):  update public.app_config set kill_switch = true;
--   Reactivar la IA:          update public.app_config set kill_switch = false;
--   Volver premium a alguien: update public.profiles set plan='premium' where id='<uuid>';
-- =============================================================================
