# Despensa Inteligente — Arquitectura técnica (diseño para revisión)

**Autor:** Torvalds (CTO) · **Para:** Lugia (Director) / Emiliano · **Fecha:** 2026-08 · **Estado:** DISEÑO CERRADO (3 VB resueltas por el Director). **No construir aún — espera GO de Emiliano.**
**Brief:** el coach conoce lo que el usuario tiene en casa y lo usa para recomendar. **Regla:** analizar lo existente + arquitectura limpia y ADITIVA, sin romper nada vivo.

**Decisiones resueltas (Director, alineadas con el MVP de Drucker):**
- **(a) Open Food Facts:** SÍ, semilla **lazy** (on-scan/on-search + caché) con **atribución visible** ("Datos de Open Food Facts"); NO dependencia dura (fallback a `usuario`/`estimado_ia` si falta o la cobertura MX es pobre). ODbL share-alike solo pesa al **redistribuir/exportar** la BD derivada → para MVP (uso interno + mostrar con atribución) es aceptable; **NOTA: revisión legal ANTES de exportar/redistribuir un catálogo grande en V2.**
- **(b) 1 despensa por usuario en V1** (multi-despensa casa/oficina/familia = V2).
- **(c) `meals` INTACTO en V1** (sin `meal_items`; registrar usa el `/api/meals` freeform actual; link despensa↔meals que descuenta inventario = V2).

---

## 1. Análisis del esquema actual (lo que ya existe)

**Identidad / plan / cuota**
- `auth.users` = fuente de identidad. `profiles(id=auth.uid, plan free|premium)` (trigger crea la fila al signup).
- `subscriptions` (Stripe), `usage_counters`/`global_usage`/`usage_events` + `app_config` + `ai_usage*` (caps de IA por-feature). **No tocar.**

**Nutrición / coach**
- `nutrition_profiles(user_id PK)` — sexo/edad/peso, `coach`, `coach_params jsonb`, `dietary_pattern`, **`allergies`/`intolerances`/`conditions` jsonb**, `country='MX'`, `budget`, `cook_time`. → ya alimenta el filtro de alérgenos (`findViolations`) y `generar_cena`.
- `nutrition_targets(user_id PK)` — metas del motor (kcal/macros/fibra/agua).
- `meals(id bigint, user_id, date, time, title, calories int, protein_g/carbs_g/fat_g real, ingredients jsonb[strings], confidence text, image)` — **comidas son texto libre** (título + macros de IA/manual); **no hay vínculo a un catálogo de productos**. Ya trae un campo `confidence` (semilla del patrón "nivel de confianza").
- Coach: `coach_conversations`/`coach_messages`/`coach_summaries`, `coach_day_state`, `coach_memories`. `assembleContext` inyecta perfil+metas+estado del día+memoria en `<contexto_dia>`. **`generar_cena` YA acepta `ingredientes_disponibles[]`** (hoy vacío) → seam natural para la despensa.

**Storage:** bucket privado `meal-photos`, RLS por carpeta `{user.id}/`.

**Patrones establecidos a reutilizar:** RLS `user_id = (select auth.uid())` + `revoke anon / grant authenticated`; SQL aditivo/idempotente (`create table if not exists`, `drop policy if exists`); tablas del coach son **deploy-safe** (si no existen, la lectura devuelve vacío y no rompe). El diseño de abajo sigue estos patrones al pie.

**Conclusión:** la despensa es 100% **aditiva**. Cero cambios a `meals/profiles/targets/coach/stripe`. El único punto de integración con el coach es **de lectura** (inyectar la despensa al contexto) y **rellenar `ingredientes_disponibles`** de `generar_cena`.

---

## 2. Regla dura de CONFIANZA (columna vertebral de todo el catálogo)

Cada dato nutricional lleva **fuente + nivel + fecha**; la IA **NUNCA** inventa un valor.

- **nivel** (`nutrition_level`): `verificado` (Open Food Facts / fabricante) · `usuario` (lo capturó la persona) · `estimado_ia` (estimación del modelo, marcada). Prioridad al elegir: `verificado > usuario > estimado_ia`.
- **fuente** (`source`): de dónde salió (`open_food_facts` | `manufacturer` | `user` | `ai`), con `source_ref` (código de barras / URL OFF / id) y `as_of date`.
- **Sin dato ⇒ no se inventa:** si un producto no tiene ninguna fila de nutrición, el coach lo dice ("sin datos nutricionales; ¿lo registras a mano?") y usa la ruta manual gratis. Coherente con `meals.confidence` y con el guard de salud ya en vivo.

Esto vive en `product_nutrition` (abajo) y se propaga a las tarjetas/recomendaciones (el frontend muestra el nivel; "estimado" nunca se pinta como "verificado").

---

## 3. Esquema propuesto (ADITIVO, no ejecutar)

Dos zonas: **CATÁLOGO compartido** (lectura para todos, append contribuible) y **DATOS DEL USUARIO** (RLS por dueño).

### 3.1 Catálogo compartido (SELECT authenticated; INSERT append con `created_by=auth.uid`; sin UPDATE/DELETE ajeno)
```
brands            (id uuid pk, name, norm unique, created_by, created_at)
categories        (id uuid pk, name, norm, parent_id → categories.id, created_at)   -- taxonomía árbol
products          (id uuid pk, name, norm, brand_id → brands, category_id → categories,
                   default_unit text, image_url, off_id text, origen text check(open_food_facts|user|ai|manufacturer),
                   created_by uuid, created_at)                     -- created_by null = semilla
barcodes          (id uuid pk, product_id → products, code text unique, tipo text(ean13|upc|otro),
                   source text, created_at)                        -- 1 producto → N códigos; lookup code→producto
product_nutrition (id uuid pk, product_id → products,
                   base_amount numeric, base_unit text(g|ml|porcion),   -- p.ej. por 100 g
                   calories numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
                   fiber_g numeric null, sodium_mg numeric null, azucar_g numeric null,
                   nivel text check(verificado|usuario|estimado_ia),    -- REGLA DE CONFIANZA
                   source text, source_ref text, as_of date, created_by uuid, created_at)
                   -- N filas por producto (varias fuentes); se elige por prioridad de nivel
product_sources   (id uuid pk, product_id → products, source_type text(open_food_facts|user|ai|manufacturer),
                   external_id text, url text, fetched_at timestamptz, raw jsonb)   -- procedencia/auditoría
product_alternatives (id uuid pk, product_id → products, alt_product_id → products,
                   motivo text(sustituto|similar|mas_barato|sin_alergeno), score numeric)   -- V2 sobre todo
```

### 3.2 Datos del usuario (RLS `user_id = auth.uid()`; revoke anon / grant authenticated)
```
pantries          (id uuid pk, user_id → auth.users, nombre text default 'Mi despensa',
                   es_default boolean, created_at)                   -- V1: 1 por usuario; permite N (alacena/refri) después
pantry_items      (id uuid pk, pantry_id → pantries, user_id (denormalizado p/ RLS),
                   product_id → products null, texto_libre text null,   -- producto del catálogo O ítem libre
                   cantidad numeric, unidad text, caduca_el date null,  -- cantidad_disponible + unidad + caducidad OPCIONAL
                   abierto_el date null, umbral_bajo numeric null, added_at, updated_at)
shopping_lists    (id uuid pk, user_id → auth.users, nombre text, estado text(activa|comprada|archivada), created_at)
shopping_list_items (id uuid pk, list_id → shopping_lists, user_id, product_id → products null, texto_libre text null,
                   cantidad numeric, unidad text, marcado boolean default false,
                   origen text(coach|manual|receta), created_at)
recipes           (id uuid pk, user_id → auth.users null,            -- null = semilla/compartida
                   titulo text, porciones int, instrucciones text, origen text(user|ai|seed), created_at)
recipe_ingredients(id uuid pk, recipe_id → recipes, product_id → products null, texto_libre text null,
                   cantidad numeric, unidad text)                    -- (añadido: recipes sin ingredientes no sirve)
```

**Índices clave:** `barcodes.code` unique btree (scan→producto O(1)); `products.norm` + `brands.norm` con **pg_trgm** (búsqueda difusa por nombre/marca — requiere `create extension pg_trgm`, anotado); `pantry_items(pantry_id)`, `pantry_items(user_id, caduca_el)` (caducidad).

**Unidades:** `unidad` como texto con vocabulario sugerido (`g|ml|pieza|paquete|lata|taza…`); la nutrición se ancla a `base_amount/base_unit` (p.ej. por 100 g) para poder escalar macros a la cantidad de la despensa.

---

## 4. Búsqueda de productos
- **Por nombre/marca:** `norm` (minúsculas/sin acentos, reusa el normalizador del guard) + `pg_trgm` (`ILIKE`/similarity) → ranking. Endpoint `GET /api/pantry/search?q=`.
- **Por código de barras:** `barcodes.code` unique → producto. Endpoint `GET /api/pantry/barcode/:code`. **Miss →** fallback a Open Food Facts (§5), se cachea en el catálogo, siguiente lookup es local.
- Filtro de alérgenos: los productos/ingredientes pasan por el `findViolations` YA en vivo (hermético) → coherencia con el guard de salud.

---

## 5. Fuente de productos — Open Food Facts (evaluación)
**OFF** = base abierta, gratis, con **códigos de barras + nutrición por 100 g/ml + muchos productos MX** (API REST `world.openfoodfacts.org/api/v2/product/{barcode}.json`). Encaja como **semilla de datos `verificado`**.
- **Estrategia lazy (no construir la BD MX de golpe):** on-scan / on-search con miss → consultar OFF → crear `products` + `product_nutrition(nivel='verificado', source='open_food_facts', source_ref=barcode, as_of=today)` + `barcodes` + `product_sources(raw=json)`. Se **cachea** en nuestro catálogo → costo marginal decreciente, sin importación masiva.
- **Capas de confianza:** OFF `verificado` → contribución del usuario `usuario` → estimación `estimado_ia` (último recurso, marcado). Nunca se sobreescribe un `verificado` con `estimado_ia`.
- **Resuelto (Director):** OFF = semilla lazy V1 con **atribución visible** ("Datos de Open Food Facts"), **no** dependencia dura (miss/cobertura pobre → `usuario`/`estimado_ia`). Cobertura MX variable ⇒ el `nivel` degrada, el valor **no se inventa**. Rate limits ⇒ cachear en el catálogo.
- **ODbL (nota legal):** el share-alike de ODbL aplica al **redistribuir/exportar** la base derivada. MVP (uso interno + mostrar con atribución) = aceptable. **REVISIÓN LEGAL obligatoria ANTES de exportar/redistribuir un catálogo grande (V2).**

---

## 6. Integración con el coach SIN romper lo vivo
- **Solo lectura al contexto:** `assembleContext` suma una consulta opcional a `pantry_items` activos (como ya hace con `coach_day_state`/`coach_memories`) → línea "Despensa: …" en `<contexto_dia>`. **Deploy-safe:** si las tablas no existen aún, devuelve vacío y no rompe (mismo patrón).
- **Seam existente:** `generar_cena` YA acepta `ingredientes_disponibles[]` → se auto-rellena con la despensa; `cambiar_plan`/`lista_super` la consumen. Cero tools nuevas obligatorias en V1.
- **`lista_super`:** los faltantes (receta/plan − despensa) alimentan `shopping_lists`.
- **meals ↔ despensa:** en V1 **no se toca `meals`** (freeform sigue igual). V2: link opcional `meal_items(meal_id, product_id, cantidad)` + decremento de `pantry_items` al registrar. Aditivo, sin romper el registro actual.
- **Números del motor/BD, no del modelo:** las macros de una recomendación salen de `product_nutrition` con su `nivel`; si es `estimado_ia`, se marca. Consistente con la regla que ya rige tarjetas/registro.

---

## 7. RLS / seguridad (siguiendo el patrón vivo)
- **Catálogo** (`products/brands/categories/product_nutrition/barcodes/product_sources/product_alternatives`): `enable rls`; `select` a `authenticated` (lectura compartida); `insert` a `authenticated` con `check (created_by = auth.uid())` (append contribuible); **sin** update/delete de filas ajenas; `revoke all from anon`.
- **Usuario** (`pantries/pantry_items/shopping_lists/shopping_list_items` + recetas del usuario): CRUD propio `user_id = (select auth.uid())`; `revoke anon / grant authenticated`.
- Datos de salud (alérgenos derivados de productos) siguen la regla dura del guard; nada sensible expuesto a `anon`.

---

## 8. Alcance MVP V1 vs V2

**V1 (entrega el valor "el coach usa lo que tengo"):**
- `pantries` + `pantry_items` (crear despensa, agregar ítems con **cantidad + unidad + caducidad opcional**).
- Catálogo mínimo: `products/brands/categories/product_nutrition/barcodes/product_sources`, **sembrado lazy desde OFF** (por escaneo/búsqueda).
- **Búsqueda** por nombre/marca (trgm) y por **código de barras** (OFF fallback).
- **Nutrición asociada** con la **regla de confianza** (verificado/usuario/estimado_ia + fecha).
- **Integración coach:** despensa → contexto + auto-relleno de `ingredientes_disponibles` en `generar_cena`; respeta alérgenos.
- `shopping_lists` básica (faltantes del plan/receta).

**V2 (escala):**
- BD MX grande curada, **tiendas + precios**, `product_alternatives` (sustituciones "sin lácteo", "más barato").
- **Caducidad avanzada** (alertas, anti-desperdicio), recetas con `recipe_ingredients` + "cocinar" que **descuenta** de la despensa.
- **meals ↔ despensa** (decremento al registrar), escaneo de barras en UI nativo, aportes de usuario moderados.

---

## 9. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Romper lo vivo | 100% aditivo; coach solo LEE; deploy-safe si faltan tablas (patrón coach_*) |
| IA inventa macros | Regla de confianza en `product_nutrition`; sin dato → ruta manual, nunca fabricar |
| Licencia OFF (ODbL) | Atribución visible; semilla no dependencia dura. Share-alike solo al redistribuir/exportar → REVISIÓN LEGAL antes de V2 (exportar catálogo grande) |
| Datos MX incompletos | Capas verificado→usuario→estimado_ia; el nivel degrada, el valor no se inventa |
| Alérgenos en productos | Reusa `findViolations` (guard hermético ya en vivo) |
| Crecimiento del catálogo | Lazy-seed + caché; sin importación masiva en V1 |

## 10. Estado y siguiente paso
**Diseño CERRADO.** Las 3 decisiones quedaron **resueltas** por el Director (ver cabecera): (1) OFF semilla lazy + atribución visible + nota legal V2; (2) 1 despensa/usuario en V1; (3) `meals` intacto en V1. Coinciden con el MVP afilado de Drucker.

**No se construye aún** (ni SQL ni endpoints): Emiliano revisa la arquitectura consolidada y da el GO. Cuando llegue el GO, el siguiente paso es el **SQL aditivo idempotente** (`supabase/despensa.sql`, deploy-safe) + endpoints de búsqueda/pantry en **rebanadas testeables**, sin desplegar hasta revisión — mismo patrón tanda-chica-QA.
