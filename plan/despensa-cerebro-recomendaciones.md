# Despensa Inteligente — Cerebro y recomendaciones (DISEÑO)

**Autor:** Karpathy AI-Nutri (AI Product Designer + Nutricionista Deportivo + Arquitecto)
**Para:** Lugia (mwao6a57) · Coordinación de datos: Torvalds/CTO (gkmi48v7) · UI: Rams (skm3lj3d)
**Base viva:** `lib/nutrition/*` (motor determinista), `lib/coach/*` (context 4 capas, actions, allergens), `app/api/analyze` (visión), `plan/coach-*`, `plan/coaches-especializados-arquitectura.md`. **Fecha:** 2026-07-31
**Estado:** FASE DE DISEÑO. **No construir.**

> **Regla rectora (invariante, §6):** los números de nutrición **NUNCA** los inventa el modelo. Vienen de (a) el **producto** (fila con nutrición y su procedencia) o (b) el **motor** (`computeTargets`, pendientes). El modelo **selecciona y redacta** (qué combinar, cómo se llama el platillo, los pasos), el **backend calcula** (suma determinista de la nutrición de los productos). Todo dato lleva **procedencia**: `verificado | introducido | estimado`, y jamás se presenta un estimado como exacto.

---

## 0. Modelo de datos (coordinar con CTO) — aditivo, RLS por usuario

```sql
-- Catálogo de productos (compartible entre usuarios; nutrición + PROCEDENCIA).
products(
  id uuid pk, nombre text, marca text, codigo_barras text null,
  base text check (base in ('por_100g','por_porcion')),   -- cómo se expresan los macros
  porcion_g numeric null,                                  -- gramos por porción (si aplica)
  kcal numeric, proteina_g numeric, carbs_g numeric, grasa_g numeric,
  fibra_g numeric null, azucar_g numeric null, sodio_mg numeric null,
  fuente text check (fuente in ('etiqueta','off','usda','smae','manual')),  -- de dónde salió
  procedencia text check (procedencia in ('verificado','estimado')),        -- confianza del dato
  created_by uuid null, created_at timestamptz
)
-- Despensa del usuario (qué tiene y cuánto).
pantry_items(
  id uuid pk, user_id uuid, product_id uuid null,   -- null = producto ad-hoc inline
  nombre text,                                       -- cache legible aunque no haya product_id
  cantidad numeric, unidad text,                     -- p.ej. 2 pieza · 500 g · 1 lata
  caduca_en date null,
  fuente text check (fuente in ('scan_etiqueta','manual','sugerido')),  -- cómo entró
  nutricion_snapshot jsonb null,   -- copia de la nutrición+procedencia al momento (inmutable)
  created_at timestamptz, updated_at timestamptz
)
```
- **Reconciliación:** NO toca `meals`/`nutrition_profiles`/`nutrition_targets`/stripe. Al **registrar** una comida hecha con despensa, sigue el flujo vivo (`registrarComidaFoto`/`registrar_texto` → `POST /api/meals`); la despensa solo es la **fuente de ingredientes**, no otra tabla de consumo.
- `nutricion_snapshot` congela la nutrición **y su procedencia** cuando el ítem entra a la despensa (el producto puede corregirse después; el consumo histórico no debe cambiar).
- **Filtro de alérgenos:** `lib/coach/allergens.js` (`findViolations`) se aplica sobre los ingredientes/productos en TODA sugerencia (código, hermético).

---

## 1. "¿Qué puedo comer?" — determinista vs modelo

**Entradas:** pendientes del día (motor: `targets − Σ meals`, ya en `context.js`), `pantry_items` (con cantidades y caducidad), objetivo/coach, horario (momento), comidas previas de hoy.

**DETERMINISTA (backend, 0 IA — la fuente de los números):**
1. `pendientes = targets − Σ meals(hoy)` (ya existe).
2. Para una combinación candidata de productos × cantidades → **sumar** su nutrición desde las filas de `products`/`nutricion_snapshot` (kcal/prot/carb/gras/fibra…). Escala por cantidad y `base` (por_100g/por_porcion).
3. **Factibilidad:** solo productos realmente en despensa con cantidad suficiente; descartar caducados; **filtro de alérgenos** (findViolations) → hermético.
4. **Ajuste vs pendientes:** score de cuadre (¿la combinación cae dentro de ±10–15% de las kcal/proteína pendientes?).
5. **Ranking por objetivo** (§5) — función determinista, no la decide el modelo.

**EL MODELO REDACTA (1 llamada, sin emitir cifras):**
- Propone 2–3 **combinaciones sensatas** = selección de `{pantry_item_id, cantidad}` + título del platillo + (opcional) pasos. **No emite kcal/macros.**
- El backend calcula la nutrición de cada opción (paso 2), valida el cuadre (paso 4) y **descarta** las que violen restricciones o no cuadren.
- Salida al usuario: tarjetas `meal` (formato vivo `coach-salida-formato.md`) con **números del backend** (procedencia incluida), no del modelo.

**Tool (nueva) — `que_puedo_comer`** (formato Anthropic, `strict:true`): el modelo devuelve `opciones:[{titulo, items:[{pantry_item_id, cantidad, unidad}], pasos}]`; el backend suma y valida. Mismo patrón que `generarCena` en `lib/coach/actions.js` (grounding separado → números fuera del chat).

---

## 2. Recetas con SOLO lo disponible (nutrición estimada, etiquetada)

- **Restricción dura:** `ingredientes ⊆ despensa` (ej. "bowl de pollo" solo si hay pollo + base + verdura en despensa). El modelo compone la receta; el backend verifica que cada ingrediente exista en `pantry_items`.
- **Nutrición = suma determinista** de los productos usados (por cantidad). El **texto/pasos** los redacta el modelo.
- **Etiquetado de estimación (dos capas):**
  1. **Procedencia del producto:** si algún producto es `estimado` (no `verificado`), la receta se marca **estimada**.
  2. **Cantidad asumida:** si el usuario no dio gramos y el backend asume una porción → **estimada** (marca "porción asumida").
- **Regla del eslabón más débil:** la nutrición agregada toma la **procedencia más baja** de sus componentes (`estimado` si cualquiera lo es). La UI muestra el badge y un "~" en los números estimados; nunca "exacto".

---

## 3. Integración con el coach (4 capas) sin inflar costo

La despensa puede ser grande → **no** se vuelca completa en cada turno. Estrategia híbrida:

| Capa | Qué de la despensa | Costo |
|---|---|---|
| **L1 (cacheado)** | nada de despensa (volátil) | 0 |
| **L2 `<contexto_dia>`** | **línea compacta**: nº de productos + los **próximos a caducar** (top 3) + señal "tiene despensa" | pequeño, in normal |
| **Tool `que_puedo_comer` / `consultar_despensa`** | la **lista completa** con cantidades, on-demand (cuando la persona pregunta qué comer) | 1 fetch DB (0 IA) + 1 gen |

- **El coach responde anclado:** "Te quedan **500 kcal** (motor) y con lo que tienes puedes preparar **X** (despensa)." Las 500 kcal salen de `pendientes` (motor); la X de la tool (suma determinista). El modelo no inventa ninguna cifra.
- **Reconciliación con `context.js`:** añadir (en fase de build) una línea opcional de despensa a `contextoDiaBlock` (cap ~cuenta + caducidades), y la tool nueva al loop de `app/api/coach/chat/route.js` (junto a `generar_cena`). **Prompt caching de L1 intacto** (la despensa va en L2/tool, tras el breakpoint).
- **Costo:** detección/suma = 0 IA; 1 llamada de redacción cuando se pide; caché de L1 sin tocar. Encaja en el presupuesto (~20 MXN/usuario/mes de `coach-arquitectura.md §6`).

---

## 4. Interpretación de etiqueta por foto (reusa el patrón de `analyze`)

Reusa el patrón vivo de `app/api/analyze` (Claude visión + tool-use + billing/cuota/reembolso). **Nuevo prompt + tool `leer_etiqueta`** (visión, `strict:true`):

**Extrae** (de la foto de la tabla nutricional): `kcal, proteina_g, carbs_g, grasa_g, fibra_g, azucar_g, sodio_mg, porcion_g, porciones_por_envase, base(por_100g|por_porcion)`.

**Flujo:**
1. Foto → `leer_etiqueta` → valores estructurados (**estimado-IA**: OCR puede errar).
2. **CONFIRMAR antes de guardar:** tarjeta editable con los valores extraídos; la persona confirma/corrige.
3. Guardar como `products` (`fuente='etiqueta'`). Procedencia: **`estimado`** hasta que la persona confirme; tras confirmar/corregir queda como dato **`introducido`** (verificado por la persona sobre la etiqueta) — pero **siempre** se conserva `fuente='etiqueta'` para trazabilidad.
4. El producto entra a la despensa (`pantry_items`, `fuente='scan_etiqueta'`, `nutricion_snapshot`).

**Regla:** el modelo **lee** la etiqueta (no inventa), pero como la lectura puede fallar → **estimado-IA + confirmación obligatoria**. Números que el usuario corrige = `introducido`. Nunca se guarda sin pasar por confirmación. Billing/cuota igual que `analyze` (llamada de visión).

---

## 5. Priorización por objetivo + sustituciones

**Ranking por objetivo (función determinista sobre la nutrición ya calculada; el coach de `lib/coach/persona.js` da el foco):**

| Objetivo | Score (mayor = mejor) — todo determinista |
|---|---|
| **Pérdida de grasa** | ↑ proteína/kcal · ↑ fibra · ↓ densidad energética (kcal/g) · saciedad |
| **Hipertrofia** | ↑ proteína · energía suficiente (kcal, carbos peri-entreno) |
| **Runner** | ↑ carbohidratos · timing (peri-entreno) · hidratación |
| **Recomposición** | ↑ proteína alta · cerca de mantenimiento · cuadre |
| **Bienestar / mantener** | equilibrio + adherencia + variedad (cuadre a pendientes) |

- El **backend rankea** las opciones factibles por el score del objetivo; el **modelo redacta** las mejores. El objetivo **no** cambia los números, solo su **orden/énfasis**.

**Sustituciones (comparación determinista de dos productos):**
- Ej. **pan blanco → integral:** el backend compara `fibra_g`, `kcal`, `azucar_g`, `sodio_mg` de ambas filas de `products` y calcula el delta ("+4 g fibra, −20 kcal, −azúcar por porción").
- El **modelo redacta** la sugerencia ("cámbialo por integral: más fibra, misma saciedad"); los **números del delta salen del backend** (procedencia de cada producto incluida). Prioriza sustituciones alineadas al objetivo (§5) y respeta restricciones duras.

---

## 6. REGLA DURA — procedencia del dato (REAL vs INTRODUCIDO vs ESTIMADO)

Todo dato de nutrición lleva **procedencia**, y la UI **siempre** la muestra:

| Procedencia | Qué es | Cómo se muestra |
|---|---|---|
| **verificado** (REAL) | match en BD confiable (USDA/OFF/SMAE) o etiqueta confirmada por la persona | número exacto, sin "~" |
| **introducido** | la persona escribió/corrigió los números | número exacto, badge "tú lo pusiste" |
| **estimado** (IA) | visión/OCR sin confirmar, grounding, o **cantidad asumida** | "~" + badge "estimado", nunca "exacto" |

**Invariantes:**
1. **El modelo NUNCA emite cifras de nutrición.** Emite selección de productos + texto; el backend calcula desde `products`/motor. (Refuerza la regla viva del coach: "cifras fuera del motor/tool se ignoran en UI".)
2. **Eslabón más débil:** una opción/receta con cualquier componente `estimado` es **estimado** en agregado.
3. **Nunca presentar estimado como exacto.** Rangos o "~" y badge visible.
4. **Confirmación antes de mutar** (etiqueta y receta): igual que el flujo vivo (`registrar_texto`/`registrar_comida_foto` proponen, la persona confirma → `POST /api/meals`).
5. **Alérgenos:** filtro en código (`findViolations`) en toda sugerencia; el guard de salud no se relaja por despensa.

---

## Coordinación
- **CTO (gkmi48v7):** modelo de datos §0 (`products`, `pantry_items`, `nutricion_snapshot` con procedencia), tools `que_puedo_comer`/`leer_etiqueta`/`sugerir_sustitucion` en el loop del coach (reusan grounding separado como `generarCena`), línea compacta de despensa en `context.js` (L2) sin inflar caché, reuso del pipeline de `analyze` para la etiqueta (billing/cuota/reembolso). Números del motor/producto, nunca del modelo; alérgenos en código.
- **Rams (skm3lj3d):** UI de despensa (agregar por foto de etiqueta / manual, cantidades, caducidades), tarjeta de confirmación de etiqueta (editable), badges de procedencia (verificado/introducido/estimado) en TODA cifra, tarjetas `meal` de "¿qué puedo comer?" y de sustitución.

**Fases sugeridas (cuando se apruebe construir):** (1) modelo de datos + despensa manual + "¿qué puedo comer?" determinista + coach integrado; (2) lectura de etiqueta por foto (reusa analyze) + confirmación + procedencia; (3) sustituciones + priorización fina por objetivo; (4) grounding contra BD nutricional (verificado real) — enlaza con `plan/ia-precision.md`.
