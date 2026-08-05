-- =============================================================================
-- Producto-DB · Fase 0 — Evolución del catálogo a Base de Datos de Productos propia.
-- ADITIVO, IDEMPOTENTE, deploy-safe. Correr DESPUÉS de supabase/despensa.sql.
-- Lo corre Emiliano en el SQL Editor. NO toca meals/profiles/targets/stripe/safety.
--
-- Resoluciones de Emiliano aplicadas:
--   · Verificados GLOBALES; productos user_created se MARCAN (flag), catálogo sigue global.
--   · Update = APPEND puro: refrescar = fila NUEVA por fuente; nunca sobrescribe procedencia/fecha
--     (por eso NO se abre ninguna policy UPDATE de catálogo).
--   · Se persiste SOLO OFF (+USDA a futuro, pago diferido). UPCitemdb/BarcodeLookup = identificación,
--     no se persiste su nutrición (el service encola contribución).
--   · product_alternatives se crea AHORA (aditivo), su feature se activa en D5.
-- Ref: plan/producto-db-arquitectura.md, plan/producto-db-cerebro.md.
-- =============================================================================

create extension if not exists pg_trgm;

-- ============================ products: columnas nuevas ============================
alter table public.products add column if not exists subcategory        text;
alter table public.products add column if not exists sku                text;        -- código interno/fabricante (≠ barcode)
alter table public.products add column if not exists package_size       numeric;     -- p.ej. 500
alter table public.products add column if not exists package_unit       text;        -- 'g','ml','pza'
alter table public.products add column if not exists package_type       text;        -- 'lata','bolsa','botella','caja'
alter table public.products add column if not exists source_product_id  text;        -- id del producto EN la fuente (núcleo)
alter table public.products add column if not exists source_updated_at  timestamptz; -- cuándo la fuente actualizó el núcleo
alter table public.products add column if not exists confidence_score   numeric;     -- 0..1 (check abajo, idempotente)
alter table public.products add column if not exists is_user_created    boolean not null default false;
alter table public.products add column if not exists updated_at         timestamptz not null default now();
alter table public.products add column if not exists presentacion       text;        -- presentación CANÓNica "value|unit"
alter table public.products add column if not exists dedup_key          text;        -- clave débil canónica (Karpathy dedupKey)

-- check 0..1 en confidence_score (idempotente: drop-if-exists → add).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_confidence_score_range') then
    alter table public.products
      add constraint products_confidence_score_range
      check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1));
  end if;
end $$;

-- Dedup débil por nombre+marca+presentación: índice único PARCIAL (permite muchos NULL).
create unique index if not exists products_dedup_key_uq on public.products (dedup_key) where dedup_key is not null;

-- ============================ product_nutrition: columnas nuevas ============================
-- UNA fila por fuente. saturated_fat_g (grasa saturada) + source_updated_at (frescura por fuente,
-- drive de pickBestSource). source_ref existente = source_product_id a nivel nutrición.
alter table public.product_nutrition add column if not exists saturated_fat_g   numeric;
alter table public.product_nutrition add column if not exists source_updated_at timestamptz;

-- ============================ product_images (múltiples imágenes) ============================
create table if not exists public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  image_url   text not null,                     -- URL http (OFF/retailer) o path de storage {uid}/...
  source      text not null default 'user'
              check (source in ('open_food_facts','user','ai','manufacturer','retailer')),
  image_type  text not null default 'front'
              check (image_type in ('front','nutrition','ingredients','other')),
  is_primary  boolean not null default false,
  as_of       date,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists product_images_product on public.product_images (product_id);

-- ============================ product_alternatives (creada, feature en D5) ============================
create table if not exists public.product_alternatives (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id) on delete cascade,
  alternative_id uuid not null references public.products (id) on delete cascade,
  relation       text not null default 'similar'
                 check (relation in ('similar','healthier','cheaper','same_brand','presentation')),
  score          numeric,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  check (product_id <> alternative_id),
  unique (product_id, alternative_id, relation)
);
create index if not exists product_alternatives_product on public.product_alternatives (product_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_alternatives_score_range') then
    alter table public.product_alternatives
      add constraint product_alternatives_score_range
      check (score is null or (score >= 0 and score <= 1));
  end if;
end $$;

-- ============================ external_fetch_log (rate limit + observabilidad) ============================
-- SOLO server-side (service_role bypassa RLS). Sin grants a authenticated → deny-all por RLS.
create table if not exists public.external_fetch_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  source      text not null,            -- 'open_food_facts','usda','upcitemdb','barcode_lookup'
  query_type  text not null,            -- 'barcode','name'
  query       text,                     -- truncado por el server; sin PII
  http_status int,
  hit         boolean,                  -- ¿la fuente devolvió producto?
  latency_ms  int,
  created_at  timestamptz not null default now()
);
create index if not exists external_fetch_log_rate   on public.external_fetch_log (user_id, created_at);
create index if not exists external_fetch_log_source on public.external_fetch_log (source, created_at);

-- ============================ product_sources: ampliar fuentes permitidas ============================
-- Idempotente: reemplaza el check para admitir usda + fuentes de identificación + label_scan.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'product_sources_source_type_check') then
    alter table public.product_sources drop constraint product_sources_source_type_check;
  end if;
  alter table public.product_sources
    add constraint product_sources_source_type_check
    check (source_type in ('open_food_facts','usda','upcitemdb','barcode_lookup','label_scan','user','ai','manufacturer'));
end $$;

-- ============================ Índice fuzzy en brands.norm ============================
create index if not exists brands_norm_trgm on public.brands using gin (norm gin_trgm_ops);

-- ============================ RLS de las tablas nuevas ============================
alter table public.product_images       enable row level security;
alter table public.product_alternatives enable row level security;
alter table public.external_fetch_log   enable row level security;

-- CATÁLOGO (product_images, product_alternatives): SELECT global; INSERT append contribuible;
-- sin UPDATE/DELETE (inmutable, append puro) — coherente con brands/products/etc.
do $$
declare t text;
begin
  foreach t in array array['product_images','product_alternatives'] loop
    execute format('drop policy if exists cat_%1$s_select on public.%1$s', t);
    execute format('create policy cat_%1$s_select on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists cat_%1$s_insert on public.%1$s', t);
    execute format('create policy cat_%1$s_insert on public.%1$s for insert to authenticated with check (true)', t);
  end loop;
end $$;

-- external_fetch_log: SIN policies para authenticated → RLS niega todo a usuarios; sólo el
-- server con service_role (bypassa RLS) escribe/lee. Defensa en profundidad con grants abajo.

-- ============================ GRANTS (defensa en profundidad) ============================
revoke all on public.product_images, public.product_alternatives from anon;
grant  select, insert on public.product_images, public.product_alternatives to authenticated;

-- external_fetch_log: nada a anon ni authenticated (solo service_role, que ignora grants/RLS).
revoke all on public.external_fetch_log from anon, authenticated;

-- =============================================================================
-- FIN Fase 0. Notas:
--  · products/product_nutrition NO reciben policy UPDATE (append puro; el refresco es fila nueva).
--  · dedup_key/presentacion los calcula el ProductSearchService (funciones puras de Karpathy) al
--    insertar; el índice único parcial garantiza 1 producto por clave canónica.
--  · 'verificado' sigue escribiéndose SOLO server-side con service_role tras fetch REAL (despensa.sql).
-- =============================================================================
