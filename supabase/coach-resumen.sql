-- =============================================================================
-- calories-tracker · Coach · Historial Fase A — metering del RESUMEN PROGRESIVO
-- Pegar en: Supabase Dashboard → SQL Editor → Run. IDEMPOTENTE y ADITIVO.
-- Requiere app_config (monetizacion.sql) + ai_usage*/reembolsar_ia (coach.sql).
--
-- El resumen se genera bajo la SESIÓN del usuario (el chat/route tiene auth.uid()), así que va una
-- función gemela de consumir_ia para la feature 'resumen' — SIN re-declarar consumir_ia (evita
-- drift). El reembolso reusa reembolsar_ia (es genérico por request_id, no por feature).
--
-- Control de costo (el resumen dispara ~cada 8-10 turnos de overflow, no cada turno):
--   resumen_free_limit  = resúmenes/usuario/mes para Free (premium = ilimitado).
--   resumen_global_cap  = airbag global/mes.
--   resumen_kill_switch = apaga la generación de resúmenes SIN redeploy (cae a solo-cola).
-- =============================================================================

alter table public.app_config add column if not exists resumen_free_limit  int     not null default 30;
alter table public.app_config add column if not exists resumen_global_cap  int     not null default 50000;
alter table public.app_config add column if not exists resumen_kill_switch boolean not null default false;

-- Reserva atómica de 1 generación de resumen. Idempotente por request_id. Misma mecánica que
-- consumir_ia (plan-based: premium ilimitado, Free capado; fail-closed si falta config).
create or replace function public.consumir_resumen(p_request_id uuid)
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

  select resumen_free_limit, resumen_global_cap, resumen_kill_switch
    into v_free, v_global_cap, v_kill from public.app_config where id = true;

  if coalesce(v_kill, false) then
    return jsonb_build_object('allowed', false, 'reason', 'kill_switch', 'period', v_period);
  end if;

  select plan into v_plan from public.profiles where id = v_uid;
  if v_plan = 'premium' then
    v_limit := null; -- ilimitado para Pro
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
  values (v_uid, v_period, 'resumen', 1)
  on conflict (user_id, period, feature) do update
    set count = public.ai_usage.count + 1
    where (v_limit is null or public.ai_usage.count < v_limit)
  returning count into v_user_count;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'free_limit', 'period', v_period, 'remaining', 0);
  end if;

  insert into public.ai_global_usage (period, feature, count)
  values (v_period, 'resumen', 1)
  on conflict (period, feature) do update
    set count = public.ai_global_usage.count + 1
    where (v_global_cap is null or public.ai_global_usage.count < v_global_cap)
  returning count into v_global_count;
  if not found then
    update public.ai_usage set count = greatest(count - 1, 0)
      where user_id = v_uid and period = v_period and feature = 'resumen';
    return jsonb_build_object('allowed', false, 'reason', 'global_cap', 'period', v_period);
  end if;

  insert into public.ai_usage_events (request_id, user_id, period, feature)
  values (p_request_id, v_uid, v_period, 'resumen');

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'period', v_period,
    'remaining', case when v_limit is null then null else v_limit - v_user_count end);
end;
$$;

revoke execute on function public.consumir_resumen(uuid) from public, anon;
grant  execute on function public.consumir_resumen(uuid) to authenticated;
