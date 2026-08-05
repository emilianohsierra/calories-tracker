-- Despensa Inteligente V1 — schema ADITIVO e IDEMPOTENTE, deploy-safe. Lo corre Emiliano.
-- NO toca meals/profiles/targets/stripe. Dos zonas: CATÁLOGO compartido (lectura para todos,
-- INSERT append contribuible; sin UPDATE/DELETE → filas inmutables) y DATOS DEL USUARIO (RLS
-- propia). La regla de confianza vive en product_nutrition (nivel + source + as_of).
-- Ref: plan/despensa-arquitectura-tecnica.md.

create extension if not exists pg_trgm;

-- ============================ CATÁLOGO (compartido) ============================
create table if not exists public.brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  norm       text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  norm       text not null unique,
  parent_id  uuid references public.categories (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  norm         text not null,
  brand_id     uuid references public.brands (id) on delete set null,
  category_id  uuid references public.categories (id) on delete set null,
  default_unit text not null default 'pieza',
  image_url    text,
  off_id       text,                                   -- barcode/id de Open Food Facts si aplica
  origen       text not null default 'user' check (origen in ('open_food_facts','user','ai','manufacturer')),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists products_norm_trgm on public.products using gin (norm gin_trgm_ops);

-- REGLA DE CONFIANZA: cada fila nutricional lleva nivel + fuente + fecha. N filas por producto
-- (varias fuentes); se elige por prioridad de nivel (verificado > usuario > estimado_ia).
create table if not exists public.product_nutrition (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  base_amount numeric not null default 100,
  base_unit   text not null default 'g',               -- por 100 g / 100 ml / porción
  calories    numeric,
  protein_g   numeric,
  carbs_g     numeric,
  fat_g       numeric,
  fiber_g     numeric,
  sodium_mg   numeric,
  azucar_g    numeric,
  allergens   jsonb not null default '[]'::jsonb,      -- etiquetas de alérgeno ESTRUCTURADAS (OFF)
  nivel       text not null check (nivel in ('verificado','usuario','estimado_ia')),
  source      text,
  source_ref  text,
  as_of       date,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists product_nutrition_product on public.product_nutrition (product_id);

create table if not exists public.barcodes (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  code       text not null unique,
  tipo       text not null default 'ean13',
  source     text,
  created_at timestamptz not null default now()
);

create table if not exists public.product_sources (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  source_type text not null check (source_type in ('open_food_facts','user','ai','manufacturer')),
  external_id text,
  url         text,
  fetched_at  timestamptz,
  raw         jsonb,
  created_at  timestamptz not null default now()
);

-- ============================ USUARIO (RLS propia) ============================
create table if not exists public.pantries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  nombre     text not null default 'Mi despensa',
  es_default boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists pantries_user on public.pantries (user_id);

create table if not exists public.pantry_items (
  id         uuid primary key default gen_random_uuid(),
  pantry_id  uuid not null references public.pantries (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,   -- denormalizado p/ RLS
  product_id uuid references public.products (id) on delete set null,   -- link OPCIONAL al catálogo
  nombre     text not null,                             -- snapshot mostrado/editado por el cliente
  marca      text,
  categoria  text,
  cantidad   numeric not null default 1,
  unidad     text not null default 'pieza',
  caduca_el  date,                                      -- OPCIONAL
  nutricion  jsonb,                                     -- { base, kcal, prot, carb, gras, fibra?, procedencia }
  allergens  jsonb not null default '[]'::jsonb,        -- etiquetas de alérgeno (verificado=OFF; manual=[])
  confianza  text not null default 'user' check (confianza in ('verified','user','ai')),
  imagen     text,
  abierto_el date,
  umbral_bajo numeric,
  added_at   timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pantry_items_pantry on public.pantry_items (pantry_id);
create index if not exists pantry_items_user_caduca on public.pantry_items (user_id, caduca_el);

create table if not exists public.shopping_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  nombre     text not null default 'Mi lista',
  estado     text not null default 'activa' check (estado in ('activa','comprada','archivada')),
  created_at timestamptz not null default now()
);
create index if not exists shopping_lists_user on public.shopping_lists (user_id);

create table if not exists public.shopping_list_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.shopping_lists (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  texto_libre text,
  cantidad   numeric not null default 1,
  unidad     text not null default 'pieza',
  marcado    boolean not null default false,
  origen     text not null default 'manual' check (origen in ('coach','manual','receta')),
  created_at timestamptz not null default now(),
  check (product_id is not null or texto_libre is not null)
);
create index if not exists shopping_list_items_list on public.shopping_list_items (list_id);

-- ============================ RLS ============================
alter table public.brands             enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.product_nutrition  enable row level security;
alter table public.barcodes           enable row level security;
alter table public.product_sources    enable row level security;
alter table public.pantries           enable row level security;
alter table public.pantry_items       enable row level security;
alter table public.shopping_lists     enable row level security;
alter table public.shopping_list_items enable row level security;

-- CATÁLOGO: SELECT para authenticated; INSERT append (contribuible); sin UPDATE/DELETE (inmutable).
-- product_nutrition va APARTE (abajo): su INSERT de usuario NO puede marcar 'verificado'.
do $$
declare t text;
begin
  foreach t in array array['brands','categories','products','barcodes','product_sources'] loop
    execute format('drop policy if exists cat_%1$s_select on public.%1$s', t);
    execute format('create policy cat_%1$s_select on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists cat_%1$s_insert on public.%1$s', t);
    execute format('create policy cat_%1$s_insert on public.%1$s for insert to authenticated with check (true)', t);
  end loop;
end $$;

-- ANTI-ENVENENAMIENTO DE CATÁLOGO (QA Slowking): un usuario NO puede insertar nutrición
-- 'verificado' (máxima prioridad/confianza) → sólo 'usuario' | 'estimado_ia'. El nivel
-- 'verificado' se reserva al path de OFF/servicio vía la función SECURITY DEFINER de abajo.
drop policy if exists cat_product_nutrition_select on public.product_nutrition;
create policy cat_product_nutrition_select on public.product_nutrition for select to authenticated using (true);
drop policy if exists cat_product_nutrition_insert on public.product_nutrition;
create policy cat_product_nutrition_insert on public.product_nutrition
  for insert to authenticated with check (nivel in ('usuario','estimado_ia'));

-- USUARIO: CRUD propio por auth.uid().
do $$
declare t text;
begin
  foreach t in array array['pantries','pantry_items','shopping_lists','shopping_list_items'] loop
    execute format('drop policy if exists own_%1$s_select on public.%1$s', t);
    execute format('create policy own_%1$s_select on public.%1$s for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists own_%1$s_insert on public.%1$s', t);
    execute format('create policy own_%1$s_insert on public.%1$s for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists own_%1$s_update on public.%1$s', t);
    execute format('create policy own_%1$s_update on public.%1$s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists own_%1$s_delete on public.%1$s', t);
    execute format('create policy own_%1$s_delete on public.%1$s for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ============================ GRANTS (defensa en profundidad) ============================
revoke all on public.brands, public.categories, public.products, public.product_nutrition, public.barcodes, public.product_sources from anon;
grant select, insert on public.brands, public.categories, public.products, public.product_nutrition, public.barcodes, public.product_sources to authenticated;

revoke all on public.pantries, public.pantry_items, public.shopping_lists, public.shopping_list_items from anon;
grant select, insert, update, delete on public.pantries, public.pantry_items, public.shopping_lists, public.shopping_list_items to authenticated;

-- Alters defensivos (idempotencia si las tablas ya existían de una corrida previa).
alter table public.product_nutrition add column if not exists allergens jsonb not null default '[]'::jsonb;
alter table public.pantry_items      add column if not exists allergens jsonb not null default '[]'::jsonb;

-- 'verificado' se escribe SOLO por el server con SERVICE_ROLE (bypassa RLS) en /api/pantry/search
-- tras un fetch REAL a OFF — NUNCA por un RPC/insert que el usuario controle (Slowking). Por eso
-- NO hay función definer callable por authenticated: se elimina si existía de una corrida previa.
drop function if exists public.insert_off_nutrition(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text);

-- BACKLOG-1 (no bloqueante, documentado): además de user_id, validar que el pantry_id/list_id
-- del INSERT pertenezca a auth.uid() (trigger/policy que verifique pantry.user_id = auth.uid()).
-- Hoy la RLS acota por user_id; un pantry_id ajeno con user_id propio no filtra por FK. Pendiente.

-- ============================ CAP '¿qué puedo comer?' (despensa_reco) ============================
-- Reserva atómica N/mes ANTES de la reco (mismo patrón que consumir_ia, feature aparte). Reusa
-- ai_usage/ai_global_usage/ai_usage_events (coach.sql) y reembolsar_ia (feature-agnóstico).
alter table public.app_config add column if not exists despensa_reco_free_limit  int     not null default 3;
alter table public.app_config add column if not exists despensa_reco_global_cap   int     not null default 20000;
alter table public.app_config add column if not exists despensa_reco_kill_switch  boolean not null default false;

create or replace function public.consumir_reco(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_period text; v_plan text;
  v_free int; v_global_cap int; v_kill boolean;
  v_limit int; v_user_count int; v_global_count int;
  v_existing public.ai_usage_events%rowtype;
  v_feature text := 'despensa_reco';
begin
  if v_uid is null then return jsonb_build_object('allowed', false, 'reason', 'no_auth'); end if;
  v_period := to_char((now() at time zone 'America/Mexico_City'), 'YYYY-MM');

  select * into v_existing from public.ai_usage_events where request_id = p_request_id;
  if found then return jsonb_build_object('allowed', true, 'reason', 'idempotent_replay', 'period', v_existing.period); end if;

  select despensa_reco_free_limit, despensa_reco_global_cap, despensa_reco_kill_switch
    into v_free, v_global_cap, v_kill from public.app_config where id = true;

  if coalesce(v_kill, false) then return jsonb_build_object('allowed', false, 'reason', 'kill_switch', 'period', v_period); end if;

  select plan into v_plan from public.profiles where id = v_uid;
  if v_plan = 'premium' then
    v_limit := null;
  else
    if v_free is null then return jsonb_build_object('allowed', false, 'reason', 'config_missing', 'period', v_period); end if;  -- fail-closed
    v_limit := v_free;
  end if;
  if v_limit is not null and v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'free_limit', 'period', v_period, 'remaining', 0);
  end if;

  insert into public.ai_usage (user_id, period, feature, count) values (v_uid, v_period, v_feature, 1)
    on conflict (user_id, period, feature) do update set count = public.ai_usage.count + 1
    where (v_limit is null or public.ai_usage.count < v_limit) returning count into v_user_count;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'free_limit', 'period', v_period, 'remaining', 0); end if;

  insert into public.ai_global_usage (period, feature, count) values (v_period, v_feature, 1)
    on conflict (period, feature) do update set count = public.ai_global_usage.count + 1
    where (v_global_cap is null or public.ai_global_usage.count < v_global_cap) returning count into v_global_count;
  if not found then
    update public.ai_usage set count = greatest(count - 1, 0) where user_id = v_uid and period = v_period and feature = v_feature;
    return jsonb_build_object('allowed', false, 'reason', 'global_cap', 'period', v_period);
  end if;

  insert into public.ai_usage_events (request_id, user_id, period, feature) values (p_request_id, v_uid, v_period, v_feature);
  return jsonb_build_object('allowed', true, 'reason', 'ok', 'period', v_period,
    'remaining', case when v_limit is null then null else v_limit - v_user_count end);
end; $$;

revoke execute on function public.consumir_reco(uuid) from public, anon;
grant  execute on function public.consumir_reco(uuid) to authenticated;
