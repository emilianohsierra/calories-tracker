-- =============================================================================
-- calories-tracker · Coach · Educación Nutricional Adaptativa — MVP (Fase B1)
-- Pegar en: Supabase Dashboard → SQL Editor → Run. IDEMPOTENTE y ADITIVO.
-- Requiere nutrition_profiles (ola1.sql), app_config (monetizacion.sql), ai_usage*/reembolsar_ia
-- (coach.sql). No toca meals/stripe/coach chat. Lo corre Emiliano.
-- =============================================================================

-- 1) Nivel de conocimiento GLOBAL (MVP: solo el nivel global; dominio por-tema = fase posterior).
--    null = sin evaluar (el select('*') de context.js ya lo trae; la persona adapta profundidad).
alter table public.nutrition_profiles add column if not exists nutrition_knowledge_level text;
alter table public.nutrition_profiles drop constraint if exists nkl_valido;
alter table public.nutrition_profiles add constraint nkl_valido
  check (nutrition_knowledge_level is null
    or nutrition_knowledge_level in ('principiante', 'basico', 'intermedio', 'avanzado'));

-- 2) Progreso educativo MÍNIMO (MVP: marca "visto" + contadores de quiz; SM-2/dominio = fase posterior).
create table if not exists public.education_progress (
  user_id     uuid not null references auth.users (id) on delete cascade,
  concepto    text not null,                 -- 'proteina' | 'deficit' | 'calidad_sin_culpa' | ...
  estado      text not null default 'visto', -- MVP: 'visto'; 'aprendiendo'|'dominado' llegan con SRS (fase 2)
  aciertos    int  not null default 0,
  errores     int  not null default 0,
  ultimo_visto date,
  updated_at  timestamptz not null default now(),
  primary key (user_id, concepto)
);

-- 3) Caps de costo de la redacción educativa (Haiku). Patrón chat_*/proactivo_*/resumen_*.
alter table public.app_config add column if not exists educacion_free_limit  int     not null default 60;    -- por usuario/mes (generoso: "por qué" no es muro para Free)
alter table public.app_config add column if not exists educacion_global_cap  int     not null default 50000; -- airbag global/mes
alter table public.app_config add column if not exists educacion_kill_switch boolean not null default false; -- apaga la redacción educativa sin redeploy

-- -----------------------------------------------------------------------------
-- RLS — cada quien SOLO su progreso (auth.uid()).
-- -----------------------------------------------------------------------------
alter table public.education_progress enable row level security;

drop policy if exists ep_select_own on public.education_progress;
create policy ep_select_own on public.education_progress
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists ep_insert_own on public.education_progress;
create policy ep_insert_own on public.education_progress
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists ep_update_own on public.education_progress;
create policy ep_update_own on public.education_progress
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.education_progress from anon;
grant select, insert, update on public.education_progress to authenticated;

-- 4) Metering de la redacción educativa (bajo sesión de usuario). Gemela de consumir_ia para la
--    feature 'educacion'; reusa reembolsar_ia (genérico por request_id). Premium ilimitado; Free
--    capado (generoso) + airbag + kill-switch. NO re-declara consumir_ia (evita drift).
create or replace function public.consumir_educacion(p_request_id uuid)
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

  select educacion_free_limit, educacion_global_cap, educacion_kill_switch
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
  values (v_uid, v_period, 'educacion', 1)
  on conflict (user_id, period, feature) do update
    set count = public.ai_usage.count + 1
    where (v_limit is null or public.ai_usage.count < v_limit)
  returning count into v_user_count;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'free_limit', 'period', v_period, 'remaining', 0);
  end if;

  insert into public.ai_global_usage (period, feature, count)
  values (v_period, 'educacion', 1)
  on conflict (period, feature) do update
    set count = public.ai_global_usage.count + 1
    where (v_global_cap is null or public.ai_global_usage.count < v_global_cap)
  returning count into v_global_count;
  if not found then
    update public.ai_usage set count = greatest(count - 1, 0)
      where user_id = v_uid and period = v_period and feature = 'educacion';
    return jsonb_build_object('allowed', false, 'reason', 'global_cap', 'period', v_period);
  end if;

  insert into public.ai_usage_events (request_id, user_id, period, feature)
  values (p_request_id, v_uid, v_period, 'educacion');

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'period', v_period,
    'remaining', case when v_limit is null then null else v_limit - v_user_count end);
end;
$$;

revoke execute on function public.consumir_educacion(uuid) from public, anon;
grant  execute on function public.consumir_educacion(uuid) to authenticated;
