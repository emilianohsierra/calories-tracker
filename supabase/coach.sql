-- =============================================================================
-- calories-tracker · Coach IA Fase 1 · Rebanada 1 — hilos + mensajes
-- Pegar en: Supabase Dashboard → SQL Editor → Run. Idempotente y ADITIVO.
-- No toca meals/nutrition_*/subscriptions/app_config. RLS por auth.uid().
-- =============================================================================

-- 1) Conversaciones ("Mi Coach"): 1 hilo por usuario en Fase 1.
create table if not exists public.coach_conversations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null default 'Mi Coach',
  created_at   timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);
create index if not exists idx_coach_conv_user on public.coach_conversations (user_id);

-- 2) Mensajes (turnos) — capa L3 del contexto.
create table if not exists public.coach_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.coach_conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null default '',
  tokens_in       int,
  tokens_out      int,
  model           text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_coach_msg_conv on public.coach_messages (conversation_id, created_at);

-- 3) Resumen rolling de la conversación — L3 (para no mandar todo el transcript).
create table if not exists public.coach_summaries (
  conversation_id  uuid primary key references public.coach_conversations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  summary          text not null default '',
  upto_message_id  uuid,
  updated_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- RLS — CRUD propio scoped a auth.uid() (el chat corre bajo la sesión del usuario).
-- -----------------------------------------------------------------------------
alter table public.coach_conversations enable row level security;
alter table public.coach_messages      enable row level security;
alter table public.coach_summaries     enable row level security;

drop policy if exists cc_select_own on public.coach_conversations;
create policy cc_select_own on public.coach_conversations
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists cc_insert_own on public.coach_conversations;
create policy cc_insert_own on public.coach_conversations
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists cc_update_own on public.coach_conversations;
create policy cc_update_own on public.coach_conversations
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists cm_select_own on public.coach_messages;
create policy cm_select_own on public.coach_messages
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists cm_insert_own on public.coach_messages;
create policy cm_insert_own on public.coach_messages
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists cs_select_own on public.coach_summaries;
create policy cs_select_own on public.coach_summaries
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists cs_upsert_own on public.coach_summaries;
create policy cs_upsert_own on public.coach_summaries
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists cs_update_own on public.coach_summaries;
create policy cs_update_own on public.coach_summaries
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.coach_conversations, public.coach_messages, public.coach_summaries from anon;
grant select, insert, update on public.coach_conversations to authenticated;
grant select, insert on public.coach_messages to authenticated;
grant select, insert, update on public.coach_summaries to authenticated;

-- =============================================================================
-- CAP DE COSTO DURO por-feature (adelantado de R5). Requiere que app_config exista
-- (correr monetizacion.sql antes). Mismo patron atomico que consumir_analisis.
-- =============================================================================

-- Config de chat en app_config (server-trusted; el cliente no la puede falsificar).
alter table public.app_config add column if not exists chat_free_limit  int     not null default 3;      -- Free: preguntas/mes
alter table public.app_config add column if not exists chat_global_cap  int     not null default 20000; -- airbag global/mes
alter table public.app_config add column if not exists chat_kill_switch boolean not null default false; -- apaga el chat al instante

-- Ledger por usuario/periodo/feature.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  period  text not null,
  feature text not null,
  count   int  not null default 0,
  primary key (user_id, period, feature)
);
-- Airbag global por periodo/feature.
create table if not exists public.ai_global_usage (
  period  text not null,
  feature text not null,
  count   int  not null default 0,
  primary key (period, feature)
);
-- Idempotencia + soporte de reembolso.
create table if not exists public.ai_usage_events (
  request_id uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  period     text not null,
  feature    text not null,
  refunded   boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.ai_usage        enable row level security;
alter table public.ai_global_usage enable row level security;
alter table public.ai_usage_events enable row level security;
drop policy if exists aiu_select_own on public.ai_usage;
create policy aiu_select_own on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.ai_global_usage, public.ai_usage_events from anon, authenticated;
revoke all on public.ai_usage from anon;
grant select on public.ai_usage to authenticated;

-- Reserva atomica de 1 uso de una feature de IA (hoy 'chat'). Idempotente por request_id.
create or replace function public.consumir_ia(p_request_id uuid, p_feature text)
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

  if p_feature = 'chat' then
    select chat_free_limit, chat_global_cap, chat_kill_switch
      into v_free, v_global_cap, v_kill from public.app_config where id = true;
  else
    return jsonb_build_object('allowed', false, 'reason', 'bad_feature');
  end if;

  if coalesce(v_kill, false) then
    return jsonb_build_object('allowed', false, 'reason', 'kill_switch', 'period', v_period);
  end if;

  select plan into v_plan from public.profiles where id = v_uid;
  if v_plan = 'premium' then
    v_limit := null;
  else
    -- M-C1: FAIL-CLOSED. Si el límite Free no está configurado (app_config ausente),
    -- bloquear en vez de tratar como ilimitado — es lo que el cap debe garantizar.
    if v_free is null then
      return jsonb_build_object('allowed', false, 'reason', 'config_missing', 'period', v_period);
    end if;
    v_limit := v_free;
  end if;
  if v_limit is not null and v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'free_limit', 'period', v_period, 'remaining', 0);
  end if;

  insert into public.ai_usage (user_id, period, feature, count)
  values (v_uid, v_period, p_feature, 1)
  on conflict (user_id, period, feature) do update
    set count = public.ai_usage.count + 1
    where (v_limit is null or public.ai_usage.count < v_limit)
  returning count into v_user_count;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'free_limit', 'period', v_period, 'remaining', 0);
  end if;

  insert into public.ai_global_usage (period, feature, count)
  values (v_period, p_feature, 1)
  on conflict (period, feature) do update
    set count = public.ai_global_usage.count + 1
    where (v_global_cap is null or public.ai_global_usage.count < v_global_cap)
  returning count into v_global_count;
  if not found then
    update public.ai_usage set count = greatest(count - 1, 0)
      where user_id = v_uid and period = v_period and feature = p_feature;
    return jsonb_build_object('allowed', false, 'reason', 'global_cap', 'period', v_period);
  end if;

  insert into public.ai_usage_events (request_id, user_id, period, feature)
  values (p_request_id, v_uid, v_period, p_feature);

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'period', v_period,
    'remaining', case when v_limit is null then null else v_limit - v_user_count end);
end;
$$;

-- Reembolso (fallo sin salida): GREATEST(count-1,0), idempotente por request_id.
create or replace function public.reembolsar_ia(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_ev public.ai_usage_events%rowtype;
begin
  if v_uid is null then return jsonb_build_object('refunded', false, 'reason', 'no_auth'); end if;
  select * into v_ev from public.ai_usage_events where request_id = p_request_id and user_id = v_uid for update;
  if not found then return jsonb_build_object('refunded', false, 'reason', 'not_found'); end if;
  if v_ev.refunded then return jsonb_build_object('refunded', false, 'reason', 'already'); end if;
  update public.ai_usage set count = greatest(count - 1, 0)
    where user_id = v_uid and period = v_ev.period and feature = v_ev.feature;
  update public.ai_global_usage set count = greatest(count - 1, 0)
    where period = v_ev.period and feature = v_ev.feature;
  update public.ai_usage_events set refunded = true where request_id = p_request_id;
  return jsonb_build_object('refunded', true);
end;
$$;

revoke execute on function public.consumir_ia(uuid, text) from public, anon;
revoke execute on function public.reembolsar_ia(uuid)      from public, anon;
grant  execute on function public.consumir_ia(uuid, text)  to authenticated;
grant  execute on function public.reembolsar_ia(uuid)      to authenticated;
