-- =============================================================================
-- calories-tracker · Coach · Proactividad Fase 1 (MVP in-app, 0 IA)
-- Pegar en: Supabase Dashboard → SQL Editor → Run. IDEMPOTENTE y ADITIVO.
-- No toca meals/nutrition_*/subscriptions/app_config/coach_*/stripe. Lo corre Emiliano.
--
-- Dos tablas nuevas:
--   coach_notifications      → bandeja in-app + registro de idempotencia (dedupe UNIQUE).
--   coach_notification_prefs → preferencias por usuario (modo, quiet hours, toggles por tipo).
--
-- Escritura de notificaciones = SOLO el cron con service_role (bypassa RLS). El usuario NO
-- puede insertar (sin grant de insert); solo LEE lo suyo y marca visto (update). Cada quien ve
-- solo sus filas (RLS por auth.uid()). Deploy-safe: sin estas tablas, el cron hace no-op y la
-- bandeja responde [].
-- =============================================================================

-- 1) Bandeja de notificaciones proactivas + idempotencia.
create table if not exists public.coach_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  event_type  text not null,                 -- 'missed_meal' | 'low_protein' | 'streak' | 'weekly_review'
  dia         date not null,                 -- día local (America/Mexico_City) del disparo
  slot        text not null default '',       -- sub-día (futuro); '' = único del día
  titulo      text not null,
  cuerpo      text not null,                  -- CIFRAS YA HORNEADAS por el motor (0 IA en Fase 1)
  prioridad   smallint not null default 0,    -- 0 baja · 1 media · 2 alta (racha en riesgo / seguridad)
  visto       boolean not null default false,
  created_at  timestamptz not null default now(),
  -- IDEMPOTENCIA DURA: el cron inserta con ON CONFLICT DO NOTHING → nunca se dispara dos veces
  -- el mismo (usuario, tipo, día, slot). Mismo espíritu que ai_usage_events.request_id.
  constraint coach_notif_dedupe unique (user_id, event_type, dia, slot)
);
-- Índice para la bandeja: no-vistas primero, recientes arriba.
create index if not exists idx_coach_notif_user on public.coach_notifications (user_id, visto, created_at desc);

-- 2) Preferencias de notificación por usuario (1:1). Defaults = experiencia "normal".
create table if not exists public.coach_notification_prefs (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  modo             text not null default 'normal'
                     check (modo in ('tranquilo', 'normal', 'entrenador')),
  quiet_start      smallint not null default 22 check (quiet_start between 0 and 23),
  quiet_end        smallint not null default 8  check (quiet_end   between 0 and 23),
  proactive_on     boolean not null default true,   -- master switch del usuario
  on_missed_meal   boolean not null default true,
  on_low_protein   boolean not null default true,
  on_streak        boolean not null default true,
  on_weekly_review boolean not null default true,
  updated_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- RLS — cada quien SOLO lo suyo (auth.uid()). El cron escribe con service_role (bypassa RLS).
-- -----------------------------------------------------------------------------
alter table public.coach_notifications      enable row level security;
alter table public.coach_notification_prefs enable row level security;

-- Notificaciones: el usuario LEE lo suyo y puede marcar visto (update). NO insert (solo el cron).
drop policy if exists cn_select_own on public.coach_notifications;
create policy cn_select_own on public.coach_notifications
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists cn_update_own on public.coach_notifications;
create policy cn_update_own on public.coach_notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Prefs: CRUD propio (el usuario configura su modo/quiet/toggles).
drop policy if exists cnp_select_own on public.coach_notification_prefs;
create policy cnp_select_own on public.coach_notification_prefs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists cnp_insert_own on public.coach_notification_prefs;
create policy cnp_insert_own on public.coach_notification_prefs
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists cnp_update_own on public.coach_notification_prefs;
create policy cnp_update_own on public.coach_notification_prefs
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Defensa en profundidad (consistente con coach.sql / coach-day-state.sql): sin acceso anon.
-- Notificaciones: authenticated LEE lo suyo y solo puede marcar VISTO. El grant de update es a
-- nivel COLUMNA (solo `visto`) → ni siquiera sus propias notifs puede reescribirles el texto.
-- Sin insert (solo el cron/service_role), sin delete.
-- Prefs: authenticated select/insert/update. Sin delete.
revoke all on public.coach_notifications      from anon;
revoke all on public.coach_notification_prefs from anon;
grant select          on public.coach_notifications      to authenticated;
grant update (visto)  on public.coach_notifications      to authenticated;
grant select, insert, update on public.coach_notification_prefs to authenticated;
