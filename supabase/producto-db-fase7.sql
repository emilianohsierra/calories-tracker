-- =============================================================================
-- Producto-DB · Fase 7 — Lista de compras + sustituciones + recomendaciones.
-- ADITIVO, IDEMPOTENTE, deploy-safe. Correr DESPUÉS de producto-db.sql.
-- SQL-FIRST: Emiliano lo corre ANTES de desplegar el código que usa 'despensa' en origen.
--
-- REUSO (no se duplica): las tablas de lista de compras YA existen (supabase/despensa.sql):
--   shopping_lists(header) + shopping_list_items(líneas: product_id | texto_libre, cantidad,
--   unidad, marcado, origen) con RLS propia (own_*) y grants. NO se crea una tabla nueva.
--   product_alternatives (sustituciones) también existe (producto-db.sql, append-only).
-- Esta migración SOLO amplía el enum `origen` para admitir 'despensa' (restock desde la despensa)
-- y agrega un índice de lectura. NO borra/renombra nada. NO toca meals/profiles/targets/stripe.
-- =============================================================================

-- Ampliar shopping_list_items.origen: coach|manual|receta → + 'despensa'. Idempotente.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'shopping_list_items_origen_check') then
    alter table public.shopping_list_items drop constraint shopping_list_items_origen_check;
  end if;
  alter table public.shopping_list_items
    add constraint shopping_list_items_origen_check
    check (origen in ('coach', 'manual', 'receta', 'despensa'));
end $$;

-- Índice para leer la lista del usuario y filtrar por comprado/pendiente.
create index if not exists shopping_list_items_user_marcado on public.shopping_list_items (user_id, marcado);

-- =============================================================================
-- FIN Fase 7. RLS/grants sin cambios (heredados de despensa.sql: CRUD propio por auth.uid()).
-- Las sustituciones se COMPUTAN en código desde product_alternatives + calidad (nutri_score/sellos),
-- filtradas por safety.js; no se almacena veredicto. Nada inventado (faltante = null / sin fila).
-- =============================================================================
