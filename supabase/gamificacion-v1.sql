-- Gamificación V1 — ADITIVO e IDEMPOTENTE. 5 tablas nuevas (RLS own-user) + RPC otorgar_evento.
-- CERO columnas nuevas en tablas vivas. Deploy-safe: sin esta migración / GAMIFICACION_ON off → los
-- enganches best-effort no hacen nada y meals/pantry/educación siguen IGUAL.
-- Patrón: create table if not exists · enable RLS · drop/create policy (user_id = (select auth.uid()))
--         · revoke anon · grant authenticated. (plantilla supabase/coach-day-state.sql)

-- ============================ 1) LEDGER de eventos (idempotencia dura) ============================
-- UNIQUE (user_id, tipo, clave_dedupe) = anti-doble-XP. Se escribe SOLO vía la RPC (no grant de insert).
create table if not exists public.gamification_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  tipo         text not null,
  clave_dedupe text not null,
  xp           int  not null default 0,
  created_at   timestamptz not null default now(),
  constraint gamification_events_dedupe unique (user_id, tipo, clave_dedupe)
);
create index if not exists idx_gam_events_user on public.gamification_events (user_id, created_at desc);

-- ============================ 2) Progreso (XP total; el nivel se computa en JS: nivelDe) ============================
create table if not exists public.user_progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  xp_total   int not null default 0,
  updated_at timestamptz not null default now()
);

-- ============================ 3) Logros desbloqueados por usuario (catálogo = config en código) ============================
create table if not exists public.user_achievements (
  user_id     uuid not null references auth.users (id) on delete cascade,
  logro_code  text not null,
  dia         date,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, logro_code)
);

-- ============================ 4) Rachas (registro; día de gracia/recuperación §7) ============================
create table if not exists public.user_streaks (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  actual          int  not null default 0,
  mejor           int  not null default 0,
  ultimo_registro date,
  gracia_dia      date,            -- día de gracia consumido (freeze) esta semana; null = disponible
  updated_at      timestamptz not null default now()
);

-- ============================ 5) Objetivos diarios (se calculan del estado; persiste completitud) ============================
create table if not exists public.daily_goals (
  user_id       uuid not null references auth.users (id) on delete cascade,
  dia           date not null,
  goal_code     text not null,
  completado_en timestamptz not null default now(),
  primary key (user_id, dia, goal_code)
);

-- ============================ RLS + grants (todas own-user; ledger sin insert directo) ============================
do $$
declare t text;
begin
  foreach t in array array['gamification_events','user_progress','user_achievements','user_streaks','daily_goals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t||'_sel', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  -- HARDENING (Slowking): NINGUNA de las 5 tablas acepta insert/update del CLIENTE (solo SELECT-own). Los
  -- desbloqueos de logro / completitud de objetivo / XP / racha se escriben SOLO vía la RPC (SECURITY
  -- DEFINER, validada) o el cron (service_role, estado calculado server-side). Así un cron futuro NUNCA
  -- puede leer un user_achievements/daily_goals FABRICADO por el cliente como input de XP (lavado de farmeo).
  execute 'drop policy if exists user_achievements_ins on public.user_achievements';
  execute 'drop policy if exists daily_goals_ins on public.daily_goals';
end $$;
-- gamification_events / user_progress / user_achievements / daily_goals / user_streaks: SIN grant de
-- insert/update a authenticated → solo la RPC (SECURITY DEFINER) y el service_role (cron) escriben.

-- ============================ RPC otorgar_evento (atómica, idempotente, anti-farmeo) ============================
-- Authenticated → usa auth.uid() y VALIDA que la acción referida exista (no farmeable). service_role (cron,
-- auth.uid() null) → usa p_user_id para eventos estado-derivados (racha/día/semana), sin validar (confiable).
-- p_xp queda por retrocompatibilidad de firma pero se IGNORA: el XP se deriva server-side (no farmeable).
create or replace function public.otorgar_evento(
  p_tipo text, p_clave_dedupe text, p_xp int default 0, p_user_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid; v_is_user boolean; v_valido boolean; v_xp int; v_total int; v_ref text; v_clave text;
begin
  v_is_user := auth.uid() is not null;
  v_uid := coalesce(auth.uid(), p_user_id);
  if v_uid is null then return jsonb_build_object('awarded', false, 'reason', 'no_user'); end if;
  v_ref := split_part(p_clave_dedupe, ':', 2);

  -- VALIDACIÓN ANTI-FARMEO (solo para llamadas de USUARIO). El cron (service_role) omite: sus eventos son
  -- estado-derivados calculados server-side.
  if v_is_user then
    v_valido := case p_tipo
      when 'MEAL_LOGGED'       then exists (select 1 from public.meals m where m.id = nullif(v_ref,'')::bigint and m.user_id = v_uid)
      when 'LESSON_COMPLETED'  then exists (select 1 from public.education_progress e where e.concepto = v_ref and e.user_id = v_uid)
      when 'PANTRY_ITEM_ADDED' then exists (select 1 from public.pantry_items p where p.id = nullif(v_ref,'')::uuid and p.user_id = v_uid)
      when 'WORKOUT_LOGGED'    then exists (select 1 from public.coach_day_state d where d.date = nullif(v_ref,'')::date and d.user_id = v_uid and d.entreno_estado = 'hecho')
      when 'CHECKIN_COMPLETED' then exists (select 1 from public.coach_day_state d where d.date = nullif(v_ref,'')::date and d.user_id = v_uid)
      else false  -- DAY_COMPLETED / GOAL_REACHED / WEEKLY_CONSISTENT / CHALLENGE_COMPLETED = solo cron (service_role)
    end;
    if not v_valido then return jsonb_build_object('awarded', false, 'reason', 'invalid'); end if;
  end if;

  -- XP DERIVADO SERVER-SIDE por tipo (Slowking: el p_xp del cliente NO se usa → un usuario no puede inflar
  -- su XP llamando la RPC directo). Alineado con lib/gamification/config.js XP; si difieren, gana la RPC
  -- (server-trusted, fuente de la verdad para la economía).
  v_xp := case p_tipo
    when 'MEAL_LOGGED'       then 10
    when 'PANTRY_ITEM_ADDED' then 5
    when 'LESSON_COMPLETED'  then 25
    when 'WORKOUT_LOGGED'    then 15
    when 'CHECKIN_COMPLETED' then 5
    when 'DAY_COMPLETED'     then 20
    when 'GOAL_REACHED'      then 30
    when 'WEEKLY_CONSISTENT' then 100
    else 0
  end;
  if v_xp = 0 then return jsonb_build_object('awarded', false, 'reason', 'tipo_sin_xp'); end if;

  -- CLAVE DE DEDUPE CANÓNICA server-side (de inputs YA validados: tipo + v_ref real), NO del raw del
  -- cliente → una acción real = un solo award ('meal:123:1','meal:123:2',… → 'MEAL_LOGGED:123').
  v_clave := p_tipo || ':' || v_ref;

  -- LEDGER idempotente: si ya existía (replay) → no otorga.
  insert into public.gamification_events (user_id, tipo, clave_dedupe, xp)
  values (v_uid, p_tipo, v_clave, v_xp)
  on conflict (user_id, tipo, clave_dedupe) do nothing;
  if not found then return jsonb_build_object('awarded', false, 'reason', 'replay'); end if;

  -- Increment de XP (upsert). El NIVEL se computa en JS (nivelDe) para no duplicar la curva.
  insert into public.user_progress (user_id, xp_total, updated_at)
  values (v_uid, v_xp, now())
  on conflict (user_id) do update set xp_total = public.user_progress.xp_total + v_xp, updated_at = now();
  select xp_total into v_total from public.user_progress where user_id = v_uid;

  return jsonb_build_object('awarded', true, 'xp_total', v_total);
exception when others then
  -- deploy-safe: nunca propaga (la gamificación no rompe el write-path host).
  return jsonb_build_object('awarded', false, 'reason', 'error');
end $$;

revoke all on function public.otorgar_evento(text, text, int, uuid) from public, anon;
grant execute on function public.otorgar_evento(text, text, int, uuid) to authenticated;

-- Verificación (opcional): las 5 tablas + la función existen; RLS activa; ledger con UNIQUE.
