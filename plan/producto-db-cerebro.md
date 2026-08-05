# Base de datos de productos propia — Cerebro del ProductSearchService (DISEÑO)

**Autor:** Karpathy AI-Nutri (inteligencia del matching/recomendación) · Esquema: Torvalds/CTO (gkmi48v7) · UI: Rams (skm3lj3d)
**Base viva reconciliada:** `lib/pantry/off.js` (semilla OFF verificada), `lib/pantry/db.js` (products/product_nutrition/brands/barcodes/product_sources/pantry_items, `confianza` verified|user|ai), `lib/pantry/safety.js` (alérgenos — NO cambia), `lib/pantry/label.js` (`leerEtiqueta`). **Fecha:** 2026-08-05
**Estado:** FASE DE DISEÑO. **No construir.**

> **Regla rectora (§4, invariante):** el ProductSearchService **NUNCA inventa** nutrición, macros, ingredientes, marca, imagen, código de barras ni presentación. Dato faltante = `null` / "no disponible"; lo completa el usuario (`leerEtiqueta` u ingreso manual). Toda decisión de matching es **determinista** (score reproducible); la IA solo participa vía `leerEtiqueta` (visión, estimado_ia + confirmación), nunca rellenando cifras por su cuenta.

---

## 0. Flujo cache-first y dónde entra el cerebro

```
buscar(query|barcode)
  1) CATÁLOGO LOCAL (products): match por barcode → si no, fuzzy nombre+marca   ← §1,§2 (cerebro)
  2) decisión: auto-aceptar | disambiguation | no encontrado                    ← §1 (cerebro)
  3) miss → fetch externo (OFF, off.js) → DEDUP (§3) → cachea en catálogo        ← §3 (cerebro)
  4) devuelve producto con PROCEDENCIA por dato (§5); nutrición faltante = null  ← §4,§5
```
El cerebro = pasos 1–3: **scoring/confidence, fuzzy, decisión auto-vs-disambiguation, dedup**. El CTO cablea el I/O (SQL, OFF, storage). Reusa `off.js` para el fetch externo y `db.js` para el shape.

---

## 1. Matching + `confidence_score` (0–1) y decisión

**Señales (deterministas), de fuerte a débil:**
| Señal | Peso / valor | Nota |
|---|---|---|
| **Barcode exacto** (`barcodes.code`) | **1.0** | clave fuerte; auto-acepta directo |
| Marca coincide (norm) | +0.25 | `brands.norm` |
| Nombre: similitud de tokens (0–1) | ×0.55 | Jaccard de tokens + Levenshtein por token (§2) |
| Presentación coincide (cantidad+unidad) | +0.15 | `normalizePresentacion` (§3) |
| Categoría coincide | +0.05 | señal débil |

```
function confidence(query, cand):
  if barcodeExacto: return 1.0
  s = 0.55 * simNombre(query.nombre, cand.nombre)          // §2, 0..1
  if marcaMatch(query.marca, cand.marca): s += 0.25
  if presentacionMatch(query.pres, cand.pres): s += 0.15
  if categoriaMatch: s += 0.05
  return clamp(s, 0, 1)
```

**Umbrales de decisión (deterministas, calibrables):**
| confidence | Acción |
|---|---|
| **≥ 0.85** (o barcode 1.0) | **auto-aceptar** el producto |
| **0.45 – 0.85** | **disambiguation**: mostrar top-N candidatos rankeados ("¿cuál producto es?") + opción "ninguno" |
| **< 0.45** o sin candidato | **no encontrado** → agregar por etiqueta (`leerEtiqueta`) o manual |

`decideMatch(ranked, umbrales)` → `{ modo:'auto'|'disambiguation'|'no_encontrado', producto?, candidatos? }`. Regla dura: **nunca** auto-aceptar por debajo del umbral (evita atar nutrición equivocada a un producto).

---

## 2. Búsqueda fuzzy (tolerante a errores)

"atun dolres" → "Atún Dolores". Dos etapas:
1. **Recuperación de candidatos (I/O, CTO):** índice **pg_trgm** GIN sobre `products.norm` (y `brands.norm`); recupera top-K por similitud de trigramas (barato, tolerante a typos). Fallback: `ILIKE`/`unaccent` si no hay pg_trgm.
2. **Re-ranking (cerebro, determinista):** `simNombre(a,b)` = combinación de:
   - **overlap de tokens** (Jaccard sobre tokens normalizados con `norm` — minúsculas, sin acentos),
   - **Levenshtein normalizado por token** para typos ("dolres"↔"dolores" = 1 edición → sim alta),
   - bonus si los tokens raros/marca coinciden.
   Normalización reusa el `norm` de `lib/pantry` (sin acentos → "atún"="atun"). Determinista y testeable con pares (typo → producto).

---

## 3. Dedup (mismo producto por barcode Y por nombre+marca+presentación)

Dos claves:
- **Fuerte — barcode:** `barcodes.code → product_id`. `off.js:cacheOFF` ya reusa si el barcode existe. Un barcode = un `product_id`.
- **Débil — `dedup_key` canónico** (sin barcode o para colapsar duplicados): 
  ```
  dedup_key = norm(marca) + '|' + tokensOrdenados(norm(nombre_sin_marca_ni_presentacion)) + '|' + presentacionCanonica
  ```
  - `tokensOrdenados`: quita marca y presentación del nombre, ordena los tokens → **orden-independiente**.
  - `presentacionCanonica = {value, unit}` normalizada (`normalizePresentacion`): "120g"→"120|g", "120 g"→"120|g", "0.12kg"→"120|g", "1 L"→"1000|ml".
  - Ejemplo: "Yogurt Griego Lala 120g" y "Lala Yogurt Griego 120 g" → ambos `lala|griego yogurt|120|g` → **mismo producto**.
- **Al cachear (paso 3):** buscar por barcode; si no, por `dedup_key`. Si existe → **reusar `product_id`** (no duplicar); si difiere una fuente, se agrega como fila de `product_nutrition`/`product_sources` (§5), no como producto nuevo.

`dedupKey(product)` y `normalizePresentacion(text)` = funciones **puras** (cerebro), testeables.

---

## 4. Regla absoluta — NUNCA inventar (reforzada)

- **Ningún dato se fabrica:** nutrición, macros, ingredientes, marca, imagen, barcode, presentación. Si la fuente no lo trae → `null` / "no disponible".
- El **ProductSearchService devuelve productos parciales con `null`**, jamás valores plausibles inventados. La UI muestra "no disponible" y ofrece completar (`leerEtiqueta` o manual).
- La IA **solo** entra por `leerEtiqueta` (visión), que ya marca `estimado_ia` y **exige confirmación** antes de guardar (`lib/pantry/label.js`). El modelo del chat no rellena cifras (regla viva del coach).
- El **confidence gating (§1)** es parte de esta regla: por debajo del umbral **no** se ata nutrición de un candidato dudoso (eso sería "inventar" la nutrición del producto del usuario).

---

## 5. Procedencia por dato (no mezclar fuentes en silencio)

Cada dato nutricional lleva su **origen**: reusa/extiende lo vivo (`product_nutrition.source`, `source_ref`, `nivel`; `product_sources`).
- **Modelo recomendado — nutrición por FUENTE, no fusionada:** `product_nutrition` guarda **una fila por fuente** para un producto, cada una con:
  `source` (open_food_facts | label_scan | user_manual), `source_product_id` (= `source_ref`, p.ej. barcode/off_id), `source_updated_at` (frescura), `nivel`/`procedencia` (verificado | introducido | estimado), `allergens`.
- **Selección determinista** `pickBestSource(filas)`: mayor confianza (verificado > introducido > estimado); a igualdad, más reciente (`source_updated_at`). **NUNCA se mezclan campos de fuentes distintas en un registro silencioso**: si la fuente elegida no trae fibra, fibra = `null` (no se rellena desde otra fuente salvo confirmación explícita del usuario).
- La UI muestra la **procedencia** y "Datos de Open Food Facts" (atribución obligatoria, ya en off.js). 
- **Coordinar con CTO:** agregar `source_updated_at` a `product_nutrition`; `source_product_id` = el `source_ref` existente. `product_sources` cubre la traza (source_type, external_id, url).

---

## 6. OCR — reusar `leerEtiqueta` para completar

- Producto no encontrado o con nutrición `null` → el usuario **escanea la etiqueta** → `lib/pantry/label.js:leerEtiqueta` extrae `{base, porcion_g, kcal, prot, carb, gras, fibra, azucar, sodio_mg}` con `procedencia='estimado_ia', confirmado:false`.
- **Confirmación obligatoria** (tarjeta editable) → al confirmar/corregir, se crea una fila `product_nutrition` `source='label_scan'`, `nivel` = introducido (verificado-por-persona sobre la etiqueta), sin sobrescribir una fila `verificado` (OFF) existente (§5).
- No se agrega tool nueva de IA: OCR = `leerEtiqueta` (ya existe). El ProductSearchService solo orquesta (buscar → si falta → invitar a escanear/manual).

---

## 7. Seguridad de alérgenos (safety.js NO cambia)

- `lib/pantry/safety.js` **se mantiene tal cual** (blindado por Slowking: verificado por tokens OFF crudos + BELT + fail-safe anafiláctico).
- Los `allergens` de fuentes externas (OFF) se usan **solo para FILTRAR** (entran como `allergens` estructurados en ítems `verified` → `safety.clasificarItem`). **NO auto-pueblan las alergias DECLARADAS del usuario** (`nutrition_profiles.allergies`): producto-tiene-alérgeno ≠ usuario-es-alérgico. La declaración de alergia del usuario viene **solo** de su perfil.
- `db.js` ya expone `allergens` **solo en `confianza='verified'`** (un `[]` en manual NO se lee como "sin alérgenos" → DESCONOCIDO). El ProductSearchService respeta eso: al cachear, `allergens` solo se puebla en filas `verificado`; en `user`/`ai` queda sin exponer (DESCONOCIDO → fail-safe del reco).

---

## Esquema a coordinar con el CTO (aditivo sobre lo vivo)
```
products         : + dedup_key text (índice), + presentacion text (canónica)   -- ya: name, norm, brand_id, image_url, off_id, origen
product_nutrition: + source_updated_at timestamptz                              -- ya: source, source_ref(=source_product_id), nivel, allergens, macros
                   (UNA fila por fuente; no fusionar campos entre fuentes)
brands           : (ya) name, norm            -- índice pg_trgm sobre norm
barcodes         : (ya) code → product_id     -- clave fuerte de dedup
product_sources  : (ya) source_type, external_id, url  -- traza de procedencia
Índices fuzzy    : pg_trgm GIN sobre products.norm y brands.norm (búsqueda §2)
```

**Funciones puras del cerebro (a implementar cuando se apruebe build; testeables):**
`normalizeQuery`, `simNombre`, `confidence`, `rankCandidates`, `decideMatch(umbrales)`, `normalizePresentacion`, `dedupKey`, `pickBestSource`. El I/O (SQL/OFF/storage) lo cablea el CTO; el cerebro recibe candidatos y decide.

## Coordinación
- **CTO (gkmi48v7):** esquema aditivo (dedup_key, presentacion, source_updated_at), índices pg_trgm, retrieval de candidatos top-K, cache-on-miss reusando `off.js`, cableado de las funciones puras del cerebro. Nada de invención (nulls); procedencia por fuente sin fusión silenciosa.
- **Rams (skm3lj3d):** UI de disambiguation ("¿cuál producto es?" con top-N + "ninguno"), estado "no disponible" con CTA a escanear etiqueta/manual, badges de procedencia por dato, atribución OFF.

**Fases sugeridas (cuando se apruebe construir):** (1) catálogo + búsqueda exacta por barcode + fuzzy por nombre (pg_trgm) + confidence/decisión; (2) dedup (barcode + dedup_key) + cache-on-miss OFF; (3) procedencia por fuente + `pickBestSource`; (4) OCR (`leerEtiqueta`) para completar + manual. Safety.js sin tocar en ninguna fase.
