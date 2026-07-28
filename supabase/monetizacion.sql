-- =============================================================================
-- calories-tracker · Paso E · Monetización (Stripe → plan Pro)
-- Pegar TODO este archivo en: Supabase Dashboard → SQL Editor → Run.
-- ⚠️ ORDEN DE EJECUCIÓN (m5): correr SIEMPRE en este orden:
--   1) schema.sql  2) schema-meals-settings.sql  3) storage.sql  4) monetizacion.sql
-- Si RE-EJECUTAS schema.sql (que define consumir_analisis con premium=ilimitado),
-- DEBES volver a correr ESTE archivo después, porque aquí se redefine consumir_analisis
-- para respetar pro_limit. Correr monetizacion.sql de más NO hace daño (idempotente).
--
-- Reutiliza la arquitectura de límites: Stripe solo cambia profiles.plan; el motor
-- (consumir_analisis + app_config) ya aplica la cuota por plan. free=free_limit,
-- premium("Pro")=pro_limit (alto y finito + airbag global).
-- =============================================================================

-- (a) Cuota Pro en la config central (reusa app_config). NULL = ilimitado.
alter table public.app_config add column if not exists pro_limit int;
update public.app_config set pro_limit = 1000 where id = true and pro_limit is null;

-- (b) Suscripciones: fuente de verdad de la facturación (detalle + auditoría).
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text,          -- active|trialing|past_due|canceled|unpaid
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);

-- (b2) UNIQUE en stripe_customer_id: cierra el residual de B2 (checkout es check-then-act
--      sin lock; 2 pestañas podrían crear 2 customers). A nivel BD impide 2 filas con el
--      mismo customer. Índice único = idempotente y permite múltiples NULL (Postgres).
create unique index if not exists subscriptions_stripe_customer_id_key
  on public.subscriptions (stripe_customer_id);

-- (c) Idempotencia de webhooks: solo 'done' bloquea reintentos (B1). Un evento a medias
--     (crash/timeout) queda 'processing' y Stripe puede reintentarlo.
create table if not exists public.stripe_events (
  id         text primary key,          -- event.id de Stripe
  type       text,
  status     text not null default 'processing',  -- processing | done
  created_at timestamptz not null default now()
);
alter table public.stripe_events add column if not exists status text not null default 'processing';

-- (d) RLS: el usuario LEE su suscripción (para la UI); NUNCA la muta. La escritura
--     la hace solo el webhook con service_role (bypassa RLS). stripe_events sin acceso.
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;

drop policy if exists subs_select_own on public.subscriptions;
create policy subs_select_own on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.subscriptions, public.stripe_events from anon, authenticated;
grant select on public.subscriptions to authenticated;

-- (e) consumir_analisis: la ÚNICA diferencia vs schema.sql es la rama de plan, que
--     ahora usa pro_limit para 'premium' (antes: ilimitado). Todo lo demás igual
--     (atomicidad H7, airbag H4, idempotencia por request_id H9).
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
  v_pro_limit    int;
  v_global_cap   int;
  v_kill         boolean;
  v_limit        int;          -- null = ilimitado
  v_user_count   int;
  v_global_count int;
  v_existing     public.usage_events%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_auth');
  end if;

  v_period := to_char((now() at time zone 'America/Mexico_City'), 'YYYY-MM');

  select * into v_existing from public.usage_events where request_id = p_request_id;
  if found then
    return jsonb_build_object('allowed', true, 'reason', 'idempotent_replay',
                              'period', v_existing.period, 'remaining', null);
  end if;

  select free_limit, pro_limit, global_monthly_cap, kill_switch
    into v_free_limit, v_pro_limit, v_global_cap, v_kill
    from public.app_config where id = true;

  if coalesce(v_kill, false) then
    return jsonb_build_object('allowed', false, 'reason', 'kill_switch', 'period', v_period);
  end if;

  -- Límite por plan (leído INTERNAMENTE, H6): premium("Pro") = pro_limit; free = free_limit.
  select plan into v_plan from public.profiles where id = v_uid;
  if v_plan = 'premium' then
    v_limit := v_pro_limit;         -- NULL = ilimitado; finito = uso justo
  else
    v_limit := v_free_limit;
  end if;

  if v_limit is not null and v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'user_limit',
                              'period', v_period, 'remaining', 0);
  end if;

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

  insert into public.global_usage (period, count)
  values (v_period, 1)
  on conflict (period) do update
    set count = public.global_usage.count + 1
    where (v_global_cap is null or public.global_usage.count < v_global_cap)
  returning count into v_global_count;

  if not found then
    update public.usage_counters
      set count = greatest(count - 1, 0)
      where user_id = v_uid and period = v_period;
    return jsonb_build_object('allowed', false, 'reason', 'global_cap', 'period', v_period);
  end if;

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

-- (f) vincular_stripe_customer: el checkout guarda el customer de Stripe ANTES de pagar
--     (eager, B2) para no crear clientes/suscripciones duplicados. SECURITY DEFINER para
--     escribir subscriptions sin exponer service_role al cliente; solo toca la fila propia
--     y NUNCA pisa un customer ya existente ni cambia status/plan.
create or replace function public.vincular_stripe_customer(p_customer_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'no auth';
  end if;
  insert into public.subscriptions (user_id, stripe_customer_id)
  values (v_uid, p_customer_id)
  on conflict (user_id) do update
    set stripe_customer_id = excluded.stripe_customer_id
    where public.subscriptions.stripe_customer_id is null;  -- no pisar si ya existe
end;
$$;
revoke execute on function public.vincular_stripe_customer(text) from public, anon;
grant  execute on function public.vincular_stripe_customer(text) to authenticated;

-- =============================================================================
-- OPERACIÓN:
--   Ajustar cuota Pro:      update public.app_config set pro_limit = 500;   -- o NULL = ilimitado
--   Volver Pro a alguien:   update public.profiles set plan='premium' where id='<uuid>';
--   (Normalmente el plan lo pone el webhook de Stripe, no a mano.)
-- =============================================================================
