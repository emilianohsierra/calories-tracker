-- =============================================================================
-- calories-tracker · Paso 4-5 (Ruta A) · meals + user_settings en Postgres
-- Pegar TODO este archivo en: Supabase Dashboard → SQL Editor → Run.
-- Correr DESPUÉS de supabase/schema.sql (auth + cuota). Es idempotente.
-- NO migra data de SQLite (H18): se empieza limpio.
-- Mismo rigor que el schema aprobado: RLS + políticas por auth.uid().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) meals — una fila por platillo, dueña por usuario.
--    Espejo del esquema SQLite (lib/db.js) + user_id, con mejoras de tipo:
--      date        : TEXT 'YYYY-MM-DD' -> date        (rangos nativos)
--      ingredients : TEXT (JSON string)-> jsonb        (sin JSON.parse en el cliente)
--      created_at  : TEXT datetime()   -> timestamptz  default now()
-- -----------------------------------------------------------------------------
create table if not exists public.meals (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,
  time        text not null,                         -- 'HH:MM'
  title       text not null,
  description text not null default '',
  meal_type   text not null default 'comida'
              check (meal_type in ('desayuno', 'comida', 'cena', 'snack')),
  calories    int  not null default 0,
  protein_g   real not null default 0,
  carbs_g     real not null default 0,
  fat_g       real not null default 0,
  ingredients jsonb not null default '[]'::jsonb,
  confidence  text not null default '',
  image       text not null default '',              -- filename local (Storage = Paso D)
  created_at  timestamptz not null default now()
);

-- Índice que cubre las 2 consultas reales:
--   día:    where user_id = ? and date = ?
--   semana: where user_id = ? and date between ? and ?
create index if not exists idx_meals_user_date on public.meals (user_id, date);

-- -----------------------------------------------------------------------------
-- 2) user_settings — preferencias por usuario (hoy: calorie_goal).
--    Tabla SEPARADA de profiles a propósito: profiles es solo-lectura para el
--    usuario (blinda profiles.plan, H6b). Modelo key/value para conservar la API
--    getSetting/setSetting.
-- -----------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  key     text not null,
  value   text not null,
  primary key (user_id, key)
);

-- -----------------------------------------------------------------------------
-- 3) RLS — meals y user_settings son datos del usuario: CRUD completo pero
--    SIEMPRE scoped a filas propias (user_id = auth.uid()), con WITH CHECK en
--    insert/update para impedir escribir filas ajenas.
-- -----------------------------------------------------------------------------
alter table public.meals         enable row level security;
alter table public.user_settings enable row level security;

-- meals
drop policy if exists meals_select_own on public.meals;
create policy meals_select_own on public.meals
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists meals_insert_own on public.meals;
create policy meals_insert_own on public.meals
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists meals_update_own on public.meals;
create policy meals_update_own on public.meals
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists meals_delete_own on public.meals;
create policy meals_delete_own on public.meals
  for delete to authenticated using (user_id = (select auth.uid()));

-- user_settings
drop policy if exists user_settings_select_own on public.user_settings;
create policy user_settings_select_own on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists user_settings_insert_own on public.user_settings;
create policy user_settings_insert_own on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Privilegios de tabla (RLS filtra filas; el grant habilita la operación).
revoke all on public.meals, public.user_settings from anon;
grant select, insert, update, delete on public.meals to authenticated;
grant select, insert, update on public.user_settings to authenticated;

-- =============================================================================
-- El resumen semanal (app/api/summary) NO usa GROUP BY: la ruta trae las filas
-- del rango (user_id + date between) y suma en JS (Opción A, aprobada).
-- =============================================================================
