-- =============================================================================
-- Producto-DB · Fase 4 — nombre + normalización + México (nivel OFF/Yuka).
-- ADITIVO, IDEMPOTENTE, deploy-safe. Correr DESPUÉS de supabase/producto-db.sql.
-- SQL-FIRST: Emiliano corre esto ANTES de desplegar el código que lee estas columnas.
-- NO borra ni renombra nada. RLS/grants sin cambios (columnas heredan los de su tabla).
-- NO toca meals/profiles/targets/stripe/safety. Ref: plan/producto-db-arquitectura.md §12.
-- =============================================================================

create extension if not exists pg_trgm;

-- ============================ products: columnas nuevas ============================
alter table public.products add column if not exists nutri_score        text;      -- a..e (OFF), null si no hay
alter table public.products add column if not exists nova_group         smallint;  -- 1..4 (OFF), null si no hay
alter table public.products add column if not exists country            text;      -- ISO-2 país REAL de OFF (countries_tags); el GS1 del barcode solo se usa para ranking
alter table public.products add column if not exists data_quality       text;      -- verified|community|estimated|incomplete
alter table public.products add column if not exists data_quality_score numeric;   -- 0..1 completitud (≠ confidence_score)

-- checks idempotentes (no fallan si ya existen; permiten NULL siempre → nada inventado)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_nutri_score_chk') then
    alter table public.products add constraint products_nutri_score_chk
      check (nutri_score is null or nutri_score in ('a','b','c','d','e'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_nova_group_chk') then
    alter table public.products add constraint products_nova_group_chk
      check (nova_group is null or (nova_group between 1 and 4));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_data_quality_chk') then
    alter table public.products add constraint products_data_quality_chk
      check (data_quality is null or data_quality in ('verified','community','estimated','incomplete'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_data_quality_score_chk') then
    alter table public.products add constraint products_data_quality_score_chk
      check (data_quality_score is null or (data_quality_score >= 0 and data_quality_score <= 1));
  end if;
end $$;

-- ============================ product_nutrition: columnas nuevas ============================
alter table public.product_nutrition add column if not exists trans_fat_g  numeric;  -- grasas trans (null si no hay)
alter table public.product_nutrition add column if not exists serving_size numeric;  -- porción declarada (cantidad)
alter table public.product_nutrition add column if not exists serving_unit text;     -- unidad de la porción ('g','ml')

-- ============================ brands: país ============================
alter table public.brands add column if not exists country text;

-- ============================ Índice fuzzy sobre products.norm ============================
-- Ya existe products_norm_trgm (despensa.sql) y brands_norm_trgm (producto-db.sql); se asegura aquí.
create index if not exists products_norm_trgm on public.products using gin (norm gin_trgm_ops);
create index if not exists brands_norm_trgm   on public.brands   using gin (norm gin_trgm_ops);

-- ============================ Búsqueda fuzzy tolerante a typos (pg_trgm) ============================
-- Devuelve ids de productos ordenados por similitud de trigramas (usa el índice GIN). El operador `%`
-- respeta pg_trgm.similarity_threshold; además caemos a ILIKE por substring. SECURITY INVOKER →
-- respeta la RLS del catálogo (SELECT true). El re-ranking fino lo hace el cerebro (simNombre).
create or replace function public.buscar_productos_fuzzy_ids(p_q text, p_limit int default 12)
returns table (id uuid, sim real)
language sql stable security invoker
set search_path = public
as $$
  select p.id, similarity(p.norm, p_q) as sim
  from public.products p
  where p.norm % p_q or p.norm ilike '%' || p_q || '%'
  order by sim desc
  limit greatest(1, least(coalesce(p_limit, 12), 30));
$$;

revoke all on function public.buscar_productos_fuzzy_ids(text, int) from public, anon;
grant execute on function public.buscar_productos_fuzzy_ids(text, int) to authenticated;

-- =============================================================================
-- FIN Fase 4. Todo NULL-permisivo: un producto sin nutri_score/nova/país/porción es válido.
-- El código puebla estas columnas SOLO con dato REAL de la fuente (nada inventado).
-- =============================================================================
