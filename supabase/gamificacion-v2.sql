-- Gamificación V2.1 — ADITIVO e IDEMPOTENTE sobre V1. 2 tablas nuevas (RLS own) + columnas de config/prefs
-- + RPC registrar_checkin + re-creación de otorgar_evento con el CASE de CHALLENGE_COMPLETED. CERO columnas
-- nuevas en tablas vivas salvo app_config/coach_notification_prefs (add column if not exists). Deploy-safe:
-- sin esta migración / GAMIFICACION_V2_ON off → los features V2 degradan a vacío y V1 queda INTACTO.
-- Patrón: create table if not exists · enable RLS · drop/create policy (user_id = (select auth.uid()))
--         · revoke anon · grant select; escrituras sensibles solo RPC (SECURITY DEFINER) / service_role.

-- ============================ (A) Progreso de retos por usuario y periodo ============================
-- periodo = unidad de reset ('2026-W34' semanal | '2026-08' mensual) → resets sin borrar histórico.
-- SERVER-ONLY: el progreso lo calcula el cron desde el ledger de eventos; el cliente NUNCA lo reporta.
create table if not exists public.challenge_progress (
  user_id       uuid not null references auth.users (id) on delete cascade,
  challenge_id  text not null,
  periodo       text not null,
  progreso      int  not null default 0,
  meta          int  not null default 0,
  estado        text not null default 'activo' check (estado in ('activo','completado')),
  completado_en timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, challenge_id, periodo)
);
create index if not exists idx_challenge_progress_user on public.challenge_progress (user_id, periodo);

-- ============================ (B) Check-in diario (conducta; 1/día). El ánimo NO se ata a peso (TCA) ============================
create table if not exists public.checkins (
  user_id    uuid not null references auth.users (id) on delete cascade,
  dia        date not null,
  animo      text,                                   -- enum de contenido (Karpathy); jamás juicio de peso
  energia    smallint check (energia between 1 and 5),
  nota       text,
  created_at timestamptz not null default now(),
  primary key (user_id, dia)
);

-- ============================ (C) app_config: kill-switch server-side (sin redeploy) ============================
alter table public.app_config add column if not exists gamificacion_v2_kill_switch boolean not null default false;
alter table public.app_config add column if not exists retos_kill_switch           boolean not null default false;

-- ============================ (D) coach_notification_prefs: toggles de notif inteligentes (default on) ============================
alter table public.coach_notification_prefs add column if not exists on_gamif_hito boolean not null default true;
alter table public.coach_notification_prefs add column if not exists on_reto       boolean not null default true;

-- ============================ RLS + grants ============================
-- challenge_progress: SELECT-own; SIN insert/update de cliente (solo RPC/cron con service_role).
-- checkins: SELECT-own + INSERT-own (dato benigno; el XP lo valida/otorga la RPC con clave canónica).
do $$ declare t text; begin
  foreach t in array array['challenge_progress','checkins'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t||'_sel', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  execute 'drop policy if exists checkins_ins on public.checkins';
  execute 'create policy checkins_ins on public.checkins for insert to authenticated with check (user_id = (select auth.uid()))';
  execute 'drop policy if exists checkins_upd on public.checkins';
  execute 'create policy checkins_upd on public.checkins for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))';
  execute 'grant insert, update on public.checkins to authenticated';
  -- challenge_progress: sin grant de insert/update a authenticated → server-only (no gameable).
end $$;

-- ============================ (E) RPC otorgar_evento — re-creada con el CASE de CHALLENGE_COMPLETED ============================
-- Frontera de confianza intacta (V1): XP derivado server-side por tipo (el cliente NO manda p_xp), clave
-- CANÓNICA tipo:v_ref (sufijo del cliente ignorado), validación anti-farmeo para llamadas de usuario.
-- NUEVO: CHALLENGE_COMPLETED. Los retos SOLO los otorga el cron (service_role): la validación de usuario es
-- 'else false' (un cliente no puede otorgarse un reto), y el cron puede pasar el XP del reto (config retos.js)
-- vía p_xp (confiable porque viene de service_role, no de un cliente). Users siguen sin poder inflar XP.
drop function if exists public.otorgar_evento(text, text, int, uuid);
create function public.otorgar_evento(
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

  -- VALIDACIÓN ANTI-FARMEO (solo llamadas de USUARIO). El cron (service_role) omite: estado-derivado.
  if v_is_user then
    v_valido := case p_tipo
      when 'MEAL_LOGGED'       then exists (select 1 from public.meals m where m.id = nullif(v_ref,'')::bigint and m.user_id = v_uid)
      when 'LESSON_COMPLETED'  then exists (select 1 from public.education_progress e where e.concepto = v_ref and e.user_id = v_uid)
      when 'PANTRY_ITEM_ADDED' then exists (select 1 from public.pantry_items p where p.id = nullif(v_ref,'')::uuid and p.user_id = v_uid)
      when 'WORKOUT_LOGGED'    then exists (select 1 from public.coach_day_state d where d.date = nullif(v_ref,'')::date and d.user_id = v_uid and d.entreno_estado = 'hecho')
      -- check-in: válido si existe en checkins (V2) O en coach_day_state (V1) → no rompe el hook vivo; dedupe 1/día.
      when 'CHECKIN_COMPLETED' then (
        exists (select 1 from public.checkins c where c.dia = nullif(v_ref,'')::date and c.user_id = v_uid)
        or exists (select 1 from public.coach_day_state d where d.date = nullif(v_ref,'')::date and d.user_id = v_uid)
      )
      else false  -- DAY_COMPLETED / GOAL_REACHED / WEEKLY_CONSISTENT / CHALLENGE_COMPLETED = solo cron (service_role)
    end;
    if not v_valido then return jsonb_build_object('awarded', false, 'reason', 'invalid'); end if;
  end if;

  -- XP DERIVADO SERVER-SIDE por tipo (el p_xp del cliente NO se usa para tipos de usuario).
  v_xp := case p_tipo
    when 'MEAL_LOGGED'          then 10
    when 'PANTRY_ITEM_ADDED'    then 5
    when 'LESSON_COMPLETED'     then 25
    when 'WORKOUT_LOGGED'       then 15
    when 'CHECKIN_COMPLETED'    then 5
    when 'DAY_COMPLETED'        then 20
    when 'GOAL_REACHED'         then 30
    when 'WEEKLY_CONSISTENT'    then 100
    when 'CHALLENGE_COMPLETED'  then 50   -- default; el cron puede sobreescribir por reto (abajo)
    else 0
  end;
  -- Retos: SOLO el cron (service_role) puede pasar el XP del reto (config). Users nunca llegan aquí (validación).
  if p_tipo = 'CHALLENGE_COMPLETED' and not v_is_user and coalesce(p_xp, 0) > 0 then v_xp := p_xp; end if;
  if v_xp = 0 then return jsonb_build_object('awarded', false, 'reason', 'tipo_sin_xp'); end if;

  -- CLAVE DE DEDUPE CANÓNICA server-side (de inputs YA validados: tipo + v_ref real), NO del raw del cliente.
  -- reto = 'CHALLENGE_COMPLETED:<challenge_id>' (v_ref = 2º campo). check-in = 'CHECKIN_COMPLETED:<dia>' = 1/día.
  v_clave := p_tipo || ':' || v_ref;

  insert into public.gamification_events (user_id, tipo, clave_dedupe, xp)
  values (v_uid, p_tipo, v_clave, v_xp)
  on conflict (user_id, tipo, clave_dedupe) do nothing;
  if not found then return jsonb_build_object('awarded', false, 'reason', 'replay'); end if;

  insert into public.user_progress (user_id, xp_total, updated_at)
  values (v_uid, v_xp, now())
  on conflict (user_id) do update set xp_total = public.user_progress.xp_total + v_xp, updated_at = now();
  select xp_total into v_total from public.user_progress where user_id = v_uid;

  return jsonb_build_object('awarded', true, 'xp_total', v_total);
exception when others then
  return jsonb_build_object('awarded', false, 'reason', 'error');
end $$;

revoke all on function public.otorgar_evento(text, text, int, uuid) from public, anon;
grant execute on function public.otorgar_evento(text, text, int, uuid) to authenticated;

-- ============================ (F) RPC registrar_checkin — check-in atómico (inserta 1/día + otorga XP) ============================
-- SECURITY DEFINER auth.uid(). Inserta/actualiza el check-in del día y otorga XP vía otorgar_evento con la
-- clave canónica checkin:<dia> → 1 XP/día aunque el cliente llame N veces (no farmeable). Día = MX.
create or replace function public.registrar_checkin(p_animo text, p_energia smallint, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_dia date := (now() at time zone 'America/Mexico_City')::date; v_res jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_auth'); end if;
  insert into public.checkins (user_id, dia, animo, energia, nota)
  values (v_uid, v_dia, p_animo, p_energia, p_nota)
  on conflict (user_id, dia) do update set animo = excluded.animo, energia = excluded.energia, nota = excluded.nota;
  v_res := public.otorgar_evento('CHECKIN_COMPLETED', 'CHECKIN_COMPLETED:' || v_dia::text, 0, v_uid);
  return jsonb_build_object('ok', true, 'dia', v_dia, 'xp', v_res);
exception when others then
  return jsonb_build_object('ok', false, 'reason', 'error');
end $$;
revoke all on function public.registrar_checkin(text, smallint, text) from public, anon;
grant execute on function public.registrar_checkin(text, smallint, text) to authenticated;

-- ============================ (G) RPC kill-switch reader — funciona sin redeploy en cualquier cliente ============================
-- SECURITY DEFINER: lee app_config (que no está grant-eada a authenticated) y devuelve los kill-switches.
-- Así apagar V2/retos es INSTANTÁNEO (sin redeploy) tanto en endpoints de usuario como en el cron.
create or replace function public.gamificacion_v2_kill()
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object(
    'v2',    coalesce((select gamificacion_v2_kill_switch from public.app_config where id = true), false),
    'retos', coalesce((select retos_kill_switch           from public.app_config where id = true), false)
  );
$$;
revoke all on function public.gamificacion_v2_kill() from public, anon;
grant execute on function public.gamificacion_v2_kill() to authenticated;

-- Verificación (opcional): challenge_progress y checkins existen con RLS; app_config/prefs tienen las columnas;
-- otorgar_evento/registrar_checkin/gamificacion_v2_kill existen; challenge_progress SIN grant de insert a authenticated.
