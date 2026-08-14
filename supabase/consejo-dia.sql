-- =============================================================================
-- calories-tracker · Coach · CONSEJO DEL DÍA (WOW) — persistencia + metering
-- Pegar en: Supabase Dashboard → SQL Editor → Run. IDEMPOTENTE y ADITIVO.
-- Requiere app_config (monetizacion.sql), ai_usage*/reembolsar_ia (coach.sql), profiles.
-- No toca meals/coach chat/stripe. Lo corre Emiliano ANTES del deploy.
--
-- 1) coach_consejo_dia: 1 consejo por (usuario, día) — idempotencia dura por PK. El consejo se
--    genera on-first-open y se cachea; ON CONFLICT DO NOTHING evita regenerar al reabrir.
-- 2) app_config.consejo_*: caps del path IA (Pro) + kill-switch + flag Decisión B (IA para Free).
-- 3) consumir_consejo: reserva atómica del path IA (feature 'consejo'), molde de consumir_educacion;
--    Free path NO reserva (0 IA). Reusa reembolsar_ia (genérico por request_id).
-- =============================================================================

create table if not exists public.coach_consejo_dia (
  user_id      uuid not null references auth.users (id) on delete cascade,
  dia          date not null,                 -- día local (America/Mexico_City)
  foco         text not null,
  titulo       text not null,
  cuerpo       text not null,
  dato_label   text,                          -- dato_motor.label (opcional)
  dato_valor   text,                          -- dato_motor.valor (opcional)
  cta_label    text,
  cta_accion   text,
  compartido   boolean not null default false,
  generado_por text not null default 'plantilla', -- 'plantilla' (determinista) | 'ia'
  created_at   timestamptz not null default now(),
  primary key (user_id, dia)
);

alter table public.coach_consejo_dia enable row level security;

drop policy if exists ccd_select_own on public.coach_consejo_dia;
create policy ccd_select_own on public.coach_consejo_dia
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists ccd_insert_own on public.coach_consejo_dia;
create policy ccd_insert_own on public.coach_consejo_dia
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists ccd_update_own on public.coach_consejo_dia;
create policy ccd_update_own on public.coach_consejo_dia
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.coach_consejo_dia from anon;
grant select, insert, update on public.coach_consejo_dia to authenticated;

-- Caps del path IA del consejo (patrón chat_*/educacion_*). Free = 0 IA (no reserva); estos aplican
-- al Pro y al futuro flag consejo_ia_free.
alter table public.app_config add column if not exists consejo_free_limit  int     not null default 31;    -- ~1/día si se activa IA para Free (Decisión B)
alter table public.app_config add column if not exists consejo_global_cap  int     not null default 50000; -- airbag global/mes
alter table public.app_config add column if not exists consejo_kill_switch boolean not null default false; -- apaga la redacción IA del consejo sin redeploy (cae a plantilla)
alter table public.app_config add column if not exists consejo_ia_free     boolean not null default false; -- Decisión B: IA también para Free (default OFF = Decisión A)

-- Reserva atómica del path IA del consejo (bajo sesión de usuario). Premium ilimitado; Free capado
-- (solo relevante si consejo_ia_free=true). Fail-closed si falta config. Reusa reembolsar_ia.
create or replace function public.consumir_consejo(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_period text; v_plan text;
  v_free int; v_global_cap int; v_kill boolean;
  v_limit int; v_user_count int; v_global_count int;
  v_existing public.ai_usage_events%rowtype;
begin
  if v_uid is null then return jsonb_build_object('allowed', false, 'reason', 'no_auth'); end if;
  v_period := to_char((now() at time zone 'America/Mexico_City'), 'YYYY-MM');

  select * into v_existing from public.ai_usage_events where request_id = p_request_id;
  if found then
    return jsonb_build_object('allowed', true, 'reason', 'idempotent_replay', 'period', v_existing.period);
  end if;

  select consejo_free_limit, consejo_global_cap, consejo_kill_switch
    into v_free, v_global_cap, v_kill from public.app_config where id = true;

  if coalesce(v_kill, false) then
    return jsonb_build_object('allowed', false, 'reason', 'kill_switch', 'period', v_period);
  end if;

  select plan into v_plan from public.profiles where id = v_uid;
  if v_plan = 'premium' then
    v_limit := null;
  else
    if v_free is null then
      return jsonb_build_object('allowed', false, 'reason', 'config_missing', 'period', v_period);
    end if;
    v_limit := v_free;
  end if;
  if v_limit is not null and v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'free_limit', 'period', v_period, 'remaining', 0);
  end if;

  insert into public.ai_usage (user_id, period, feature, count)
  values (v_uid, v_period, 'consejo', 1)
  on conflict (user_id, period, feature) do update
    set count = public.ai_usage.count + 1
    where (v_limit is null or public.ai_usage.count < v_limit)
  returning count into v_user_count;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'free_limit', 'period', v_period, 'remaining', 0);
  end if;

  insert into public.ai_global_usage (period, feature, count)
  values (v_period, 'consejo', 1)
  on conflict (period, feature) do update
    set count = public.ai_global_usage.count + 1
    where (v_global_cap is null or public.ai_global_usage.count < v_global_cap)
  returning count into v_global_count;
  if not found then
    update public.ai_usage set count = greatest(count - 1, 0)
      where user_id = v_uid and period = v_period and feature = 'consejo';
    return jsonb_build_object('allowed', false, 'reason', 'global_cap', 'period', v_period);
  end if;

  insert into public.ai_usage_events (request_id, user_id, period, feature)
  values (p_request_id, v_uid, v_period, 'consejo');

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'period', v_period,
    'remaining', case when v_limit is null then null else v_limit - v_user_count end);
end;
$$;

revoke execute on function public.consumir_consejo(uuid) from public, anon;
grant  execute on function public.consumir_consejo(uuid) to authenticated;
