-- =============================================================================
-- calories-tracker · Ola 1 · Rebanada 1 — Fundación (perfil + plan calculado)
-- Pegar en: Supabase Dashboard → SQL Editor → Run. Idempotente y ADITIVO.
-- No toca meals, settings, subscriptions, usage_counters, app_config, storage.
-- Correr después de los schemas previos. Mismo patrón RLS por auth.uid().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) nutrition_profiles — datos del onboarding por objetivo (1 fila/usuario).
--    Son DATOS DEL USUARIO: CRUD propio con WITH CHECK (como meals).
-- -----------------------------------------------------------------------------
create table if not exists public.nutrition_profiles (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  sex                 text not null check (sex in ('male', 'female')),
  age                 int  not null check (age between 14 and 100),
  height_cm           real not null check (height_cm between 100 and 250),
  weight_kg           real not null check (weight_kg between 30 and 300),
  target_weight_kg    real check (target_weight_kg between 30 and 300),
  body_fat_pct        real check (body_fat_pct between 3 and 60),
  activity_pal        real not null check (activity_pal between 1.2 and 1.9),
  training_days       int  not null default 0 check (training_days between 0 and 14),
  coach               text not null check (coach in ('perdida_grasa','hipertrofia','runner','bienestar')),
  coach_params        jsonb not null default '{}'::jsonb,   -- respuestas específicas del coach (ritmo, experiencia, km_semana, foco…)
  objectives          jsonb not null default '{}'::jsonb,
  dietary_pattern     text not null default 'ninguno',
  intolerances        jsonb not null default '[]'::jsonb,
  allergies           jsonb not null default '[]'::jsonb,
  conditions          jsonb not null default '[]'::jsonb,   -- Ola 1: coaches no-médicos; vacío
  country             text not null default 'MX',
  budget              text,
  cook_time           text,
  tone                text not null default 'cercano',
  onboarding_completed boolean not null default false,
  consent_medical_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2) nutrition_targets — plan calculado por el motor DETERMINISTA (recomputable).
--    Escribe el backend bajo la sesión del usuario; el usuario solo lee/escribe lo suyo.
-- -----------------------------------------------------------------------------
create table if not exists public.nutrition_targets (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  bmr         int  not null,
  tdee        int  not null,
  kcal_target int  not null,
  protein_g   int  not null,
  carbs_g     int  not null,
  fat_g       int  not null,
  fiber_g     int  not null,
  water_ml    int  not null,
  method      text not null check (method in ('mifflin', 'katch')),
  computed_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3) RLS — CRUD propio scoped a auth.uid(), con WITH CHECK en insert/update.
-- -----------------------------------------------------------------------------
alter table public.nutrition_profiles enable row level security;
alter table public.nutrition_targets  enable row level security;

drop policy if exists np_select_own on public.nutrition_profiles;
create policy np_select_own on public.nutrition_profiles
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists np_insert_own on public.nutrition_profiles;
create policy np_insert_own on public.nutrition_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists np_update_own on public.nutrition_profiles;
create policy np_update_own on public.nutrition_profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists nt_select_own on public.nutrition_targets;
create policy nt_select_own on public.nutrition_targets
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists nt_insert_own on public.nutrition_targets;
create policy nt_insert_own on public.nutrition_targets
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists nt_update_own on public.nutrition_targets;
create policy nt_update_own on public.nutrition_targets
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.nutrition_profiles, public.nutrition_targets from anon;
grant select, insert, update on public.nutrition_profiles to authenticated;
grant select, insert, update on public.nutrition_targets  to authenticated;
