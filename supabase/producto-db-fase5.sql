-- =============================================================================
-- Producto-DB · Fase 5 — ingredientes + aditivos (para sellos NOM-051 e info de producto).
-- ADITIVO, IDEMPOTENTE, deploy-safe. Correr DESPUÉS de producto-db-fase4.sql.
-- SQL-FIRST: Emiliano lo corre ANTES de desplegar el código que lee/escribe estas tablas.
-- SIN nivel_riesgo: Ada confirmó que NO hay fuente libre para rating de aditivos → NUNCA un
-- semáforo estilo Yuka (sería invención). Solo código E + nombre legible (si la fuente lo da).
-- NO borra/renombra nada. NO toca meals/profiles/targets/stripe/safety.
-- =============================================================================

-- ============================ product_ingredients ============================
create table if not exists public.product_ingredients (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  ingredient text not null,
  position   int,                 -- orden en la lista (1 = primero), null si no se conoce
  source     text not null default 'open_food_facts',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists product_ingredients_product on public.product_ingredients (product_id);

-- ============================ product_additives ============================
-- Solo identidad (código E + nombre). SIN nivel de riesgo (no hay fuente libre; no se inventa).
create table if not exists public.product_additives (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  additive_code text not null,          -- p.ej. 'E330'
  name          text,                   -- nombre legible si la fuente lo provee; null si no
  source        text not null default 'open_food_facts',
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists product_additives_product on public.product_additives (product_id);

-- ============================ RLS (igual que el resto del catálogo) ============================
alter table public.product_ingredients enable row level security;
alter table public.product_additives   enable row level security;

-- SELECT global para authenticated; INSERT append (contribuible); sin UPDATE/DELETE (inmutable,
-- append puro como product_nutrition). El 'verificado'/escritura de fuente la hace el server con
-- service_role tras un fetch REAL a OFF; el INSERT append de authenticated queda permitido igual
-- que en brands/products/product_images (no hay dato de "confianza" que proteger aquí).
do $$
declare t text;
begin
  foreach t in array array['product_ingredients','product_additives'] loop
    execute format('drop policy if exists cat_%1$s_select on public.%1$s', t);
    execute format('create policy cat_%1$s_select on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists cat_%1$s_insert on public.%1$s', t);
    execute format('create policy cat_%1$s_insert on public.%1$s for insert to authenticated with check (true)', t);
  end loop;
end $$;

-- ============================ GRANTS (defensa en profundidad) ============================
revoke all on public.product_ingredients, public.product_additives from anon;
grant  select, insert on public.product_ingredients, public.product_additives to authenticated;

-- =============================================================================
-- FIN Fase 5. Faltante = NO fila (regla de oro). Los sellos NOM-051 se COMPUTAN al vuelo en el
-- código (lib/pantry/nom051.js) desde la nutrición; no se almacenan.
-- =============================================================================
