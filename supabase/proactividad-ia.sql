-- =============================================================================
-- calories-tracker · Coach · Proactividad Fase 1.5 — metering de la feature 'proactivo'
-- Pegar en: Supabase Dashboard → SQL Editor → Run. IDEMPOTENTE y ADITIVO.
-- Requiere app_config (monetizacion.sql) + las tablas ai_usage* de coach.sql.
--
-- La redacción IA proactiva la dispara el CRON (service_role, SIN sesión) → NO puede usar
-- consumir_ia/reembolsar_ia (dependen de auth.uid(), que es null bajo service_role). Por eso
-- aquí van gemelos SERVER-ONLY que reciben el user_id EXPLÍCITO y solo se conceden a service_role
-- (un usuario autenticado NO puede llamarlos ni quemar la cuota de otro).
--
-- Control de costo (tope ~20 MXN/usuario/mes por construcción):
--   · proactivo_limit       = nudges redactados con IA por usuario/mes (cap DURO, aplica a TODOS,
--     incluido Pro — la redacción es Pro-only pero el cap acota el gasto por usuario).
--   · proactivo_global_cap  = airbag global/mes (corta el gasto agregado).
--   · proactivo_kill_switch = apaga la redacción IA proactiva al instante SIN redeploy (cae al
--     texto determinista de F1).
-- =============================================================================

-- Config server-trusted (el cliente no la puede falsificar).
alter table public.app_config add column if not exists proactivo_limit       int     not null default 30;    -- IA proactiva/usuario/mes
alter table public.app_config add column if not exists proactivo_global_cap  int     not null default 50000; -- airbag global/mes
alter table public.app_config add column if not exists proactivo_kill_switch boolean not null default false; -- apaga la redacción IA proactiva

-- Reserva atómica de 1 redacción proactiva. Idempotente por request_id. user_id EXPLÍCITO
-- (el cron ya sabe de quién es el nudge). El cap aplica a TODOS (fail-closed si falta config).
create or replace function public.consumir_proactivo(p_request_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period text;
  v_limit int; v_global_cap int; v_kill boolean;
  v_user_count int; v_global_count int;
  v_existing public.ai_usage_events%rowtype;
begin
  if p_user_id is null then return jsonb_build_object('allowed', false, 'reason', 'no_user'); end if;
  v_period := to_char((now() at time zone 'America/Mexico_City'), 'YYYY-MM');

  select * into v_existing from public.ai_usage_events where request_id = p_request_id;
  if found then
    return jsonb_build_object('allowed', true, 'reason', 'idempotent_replay', 'period', v_existing.period);
  end if;

  select proactivo_limit, proactivo_global_cap, proactivo_kill_switch
    into v_limit, v_global_cap, v_kill from public.app_config where id = true;

  if coalesce(v_kill, false) then
    return jsonb_build_object('allowed', false, 'reason', 'kill_switch', 'period', v_period);
  end if;

  -- FAIL-CLOSED: sin cap configurado, NO redactar (protege el costo).
  if v_limit is null then
    return jsonb_build_object('allowed', false, 'reason', 'config_missing', 'period', v_period);
  end if;
  if v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'user_cap', 'period', v_period, 'remaining', 0);
  end if;

  insert into public.ai_usage (user_id, period, feature, count)
  values (p_user_id, v_period, 'proactivo', 1)
  on conflict (user_id, period, feature) do update
    set count = public.ai_usage.count + 1
    where public.ai_usage.count < v_limit
  returning count into v_user_count;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'user_cap', 'period', v_period, 'remaining', 0);
  end if;

  insert into public.ai_global_usage (period, feature, count)
  values (v_period, 'proactivo', 1)
  on conflict (period, feature) do update
    set count = public.ai_global_usage.count + 1
    where (v_global_cap is null or public.ai_global_usage.count < v_global_cap)
  returning count into v_global_count;
  if not found then
    update public.ai_usage set count = greatest(count - 1, 0)
      where user_id = p_user_id and period = v_period and feature = 'proactivo';
    return jsonb_build_object('allowed', false, 'reason', 'global_cap', 'period', v_period);
  end if;

  insert into public.ai_usage_events (request_id, user_id, period, feature)
  values (p_request_id, p_user_id, v_period, 'proactivo');

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'period', v_period,
    'remaining', v_limit - v_user_count);
end;
$$;

-- Reembolso proactivo (IA falló / post-check descartó el texto). Sin auth.uid() (server-only).
-- Solo reembolsa eventos de feature 'proactivo'. Idempotente por request_id.
create or replace function public.reembolsar_proactivo(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_ev public.ai_usage_events%rowtype;
begin
  select * into v_ev from public.ai_usage_events
    where request_id = p_request_id and feature = 'proactivo' for update;
  if not found then return jsonb_build_object('refunded', false, 'reason', 'not_found'); end if;
  if v_ev.refunded then return jsonb_build_object('refunded', false, 'reason', 'already'); end if;
  update public.ai_usage set count = greatest(count - 1, 0)
    where user_id = v_ev.user_id and period = v_ev.period and feature = 'proactivo';
  update public.ai_global_usage set count = greatest(count - 1, 0)
    where period = v_ev.period and feature = 'proactivo';
  update public.ai_usage_events set refunded = true where request_id = p_request_id;
  return jsonb_build_object('refunded', true);
end;
$$;

-- SERVER-ONLY: nadie salvo service_role (el cron) puede ejecutarlas. Un usuario autenticado NO
-- puede llamarlas con un p_user_id ajeno para quemar cuota de otro.
revoke execute on function public.consumir_proactivo(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reembolsar_proactivo(uuid)     from public, anon, authenticated;
grant  execute on function public.consumir_proactivo(uuid, uuid) to service_role;
grant  execute on function public.reembolsar_proactivo(uuid)     to service_role;
