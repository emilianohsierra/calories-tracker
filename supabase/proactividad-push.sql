-- =============================================================================
-- calories-tracker · Coach · Proactividad Fase 2 — Web Push (suscripciones del navegador)
-- Pegar en: Supabase Dashboard → SQL Editor → Run. IDEMPOTENTE y ADITIVO.
-- No toca meals/nutrition_*/stripe/coach_notifications. Lo corre Emiliano.
--
-- push_subscriptions: 1 fila por navegador suscrito. El usuario inserta/borra SU suscripción
-- (RLS por auth.uid()); el cron LEE con service_role para enviar. endpoint es único global
-- (identifica al navegador); si reaparece, se upsertea (re-suscripción). Sin las tablas/VAPID el
-- envío se salta (solo in-app), sin crash.
-- =============================================================================

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,   -- URL push del navegador (identidad de la suscripción)
  p256dh     text not null,          -- clave pública del cliente (cifrado del payload)
  auth       text not null,          -- secreto de autenticación del cliente
  created_at timestamptz not null default now()
);
create index if not exists idx_push_subs_user on public.push_subscriptions (user_id);

-- Toggle del nuevo trigger user_inactivity (F2). Aditivo sobre coach_notification_prefs (F1).
alter table public.coach_notification_prefs
  add column if not exists on_user_inactivity boolean not null default true;

-- -----------------------------------------------------------------------------
-- RLS — cada quien SOLO sus suscripciones. El cron las lee/borra con service_role (bypassa RLS).
-- -----------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

drop policy if exists ps_select_own on public.push_subscriptions;
create policy ps_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists ps_insert_own on public.push_subscriptions;
create policy ps_insert_own on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists ps_update_own on public.push_subscriptions;
create policy ps_update_own on public.push_subscriptions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists ps_delete_own on public.push_subscriptions;
create policy ps_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Defensa en profundidad: sin acceso anon; authenticated CRUD de lo suyo (RLS lo acota).
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
