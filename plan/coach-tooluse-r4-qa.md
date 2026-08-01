# QA focalizado — Coach tool-use sub-4: `generar_cena`

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Revisión por código + `vitest` (42/42) + prueba empírica de `findViolations`.**
Archivos: `lib/coach/actions.js`, `lib/coach/allergens.js`, `app/api/coach/chat/route.js`.

---

## VEREDICTO: ✅ LISTO-PARA-DEPLOY — con 1 hallazgo MAYOR de seguridad LATENTE

La arquitectura del filtro de alérgenos es correcta y la generación/propuesta/no-regresión pasan.
**Se puede desplegar hoy** porque hoy **ningún usuario tiene restricciones** (ver §1). PERO el
matcher `findViolations` tiene **huecos reproducibles** que, en cuanto se recolecten alergias, harían
que el "filtro en código" (la garantía central) deje pasar un alérgeno. Debe endurecerse **antes** de
cualquier slice que capture alergias/intolerancias.

---

## (1) FILTRO DURO DE ALÉRGENOS — ⚠️ arquitectura ✅, matcher con huecos (MAYOR, latente)

**Arquitectura (correcta):** `generarCena` descarta EN CÓDIGO con
`opciones.filter(o => findViolations(o.ingredientes, restr).length === 0)` **sobre** el prompt
(que además lista "RESTRICCIONES DURAS (NUNCA incluir)"). Si todas violan →
`sin_opciones_seguras` → no propone nada. Solo `seguras` llega a MealCards. ✔ diseño.

**PERO `findViolations` no detecta todos los casos** (probado en vivo):
```
restr=["nuez"]         ing=["almendra"]  -> ["almendra"]   ✔ (clave singular exacta)
restr=["nueces"]       ing=["almendra"]  -> []             ✗ el plural NO expande sinónimos
restr=["nueces"]       ing=["nuez"]      -> []             ✗
restr=["frutos secos"] ing=["almendra"]  -> []             ✗ categoría libre no expande
restr=["nuez"]         ing=["macadamia"] -> []             ✗ nuez no listada en sinónimos
restr=["mariscos"]     ing=["pulpo"]     -> []             ✗ marisco no listado
```
- **Causa raíz:** `norm()` quita el plural (`/s\b/ → ''`), pero convierte `"nueces"→"nuece"`, que ya
  **no** coincide con la clave de sinónimos `"nuez"` → no se expande. Y la lista `SYNONYMS` es finita
  (faltan macadamia, piñón, castaña, pulpo, almeja, mejillón, bacalao…) y no cubre términos-categoría
  ("frutos secos", "mariscos" en plural).
- **Consecuencia (cuando haya restricciones):** el filtro en código **dejaría pasar** una opción con
  alérgeno para quien escribió "nueces" o "frutos secos" → `generar_cena` la **propondría**. No puedo
  confirmar "una opción con alérgeno NUNCA se propone" en el caso general.

**Por qué NO es un bloqueante HOY:** verifiqué que **ni onboarding ni perfil recolectan
alergias/intolerancias** → `nutrition_profiles.allergies/intolerances` quedan `[]` para todos (default
del schema). Por tanto `restr` es siempre vacío → `findViolations` no filtra nada, el prompt no lleva
la línea de restricciones y no existe "opción con alérgeno" respecto a un alérgeno declarado. La
garantía se cumple **vacuamente**; no hay incidente posible hoy.

**Mitigación (hacer ANTES de capturar alergias — cheap y ya hay columnas/lecturas):**
1. Arreglar la normalización para que `"nueces"→"nuez"` (mapa de alias por término, o comparar sin el
   plural-strip contra las claves/sinónimos en ambos sentidos).
2. Ampliar `SYNONYMS` (frutos secos completos, mariscos, pescados) y tratar términos-categoría.
3. Ideal: test de seguridad con plurales/categorías/no-listados (los casos de arriba) que hoy no
   existen — el test actual solo cubre singular exacto + un plural feliz ("almendras"/"camarones").

## (2) GENERACIÓN — ✅
- **Grounding SEPARADO:** `proponerOpciones({anthropic, model, prompt})` es una llamada aparte; los
  números salen de ahí (backend), no de la redacción del chat. La ruta **fuerza** los bloques `meal`
  con esos números (`response.bloques = opciones.slice(0,3).map(...)`).
- **Pendientes ±10%:** el prompt pide "cúbrelas ±10%" con `pend.kcal/prot/carb/gras` del día.
- **n_opciones 1-3:** `n = [1,2,3].includes(input?.n_opciones) ? … : 2`; además `slice(0,n)`/`slice(0,3)`.
- **usar_favoritos / ingredientes_disponibles:** honrados en el prompt (favoritos si `usar_favoritos`,
  "usa SOLO estos ingredientes" si hay disponibles; sliced/saneados).

## (3) PROPONE, NO MUTA — ✅
`generarCena` **no** inserta (sin `insert`/`rpc`); devuelve `opciones` → 1-3 MealCards. El registro
ocurre solo al confirmar (`onRegisterMeal` → `POST /api/meals`). **Guard de doble-alta reusado de
sub-2:** las cards frescas traen botón Registrar (→ Registrado disabled tras guardar); las cargadas
del historial (`fromHistory`) van sin `onRegister` → rótulo "Estimado" (no re-registrables).

## (4) NO-REGRESIÓN — ✅
- **Una acción por turno:** `canAct = !guardado && !estimate && !actualizado && !opciones`; dispatch
  foto > texto > cena > ctx. Los branches previos **sin cambios**.
- **Cap / reembolso / personalidad / rediseño:** intactos (`consumir_ia` antes de Anthropic;
  reembolso solo si no hubo respuesta ni mutación/propuesta).
- sub-1 (foto), sub-2 (texto), sub-3 (contexto-día) sin tocar su lógica.

## (5) TOPES — ✅
Mismo loop: `MAX_STEPS=4` + `TIME_BUDGET_MS=45000`; tras actuar fuerza `responder`. Una `generar_cena`
= paso que la llama + grounding `proponerOpciones` + paso responder (~3 Haiku), acotado.

---

## Resumen para el Director
| Check | Estado |
|---|---|
| 1 · Filtro duro de alérgenos en código sobre el prompt + `sin_opciones_seguras` | ⚠️ arquitectura ✅ · matcher con huecos (MAYOR, latente) |
| 2 · Grounding separado, números backend, ±10% pendientes, n 1-3, favoritos/disponibles | ✅ |
| 3 · Propone no muta; frescas accionables, históricas "Estimado" | ✅ |
| 4 · No-regresión (foto/texto/contexto-día/chat/cap/reembolso/rediseño; una acción por turno) | ✅ |
| 5 · Topes MAX_STEPS=4 + 45s | ✅ |

**LISTO-PARA-DEPLOY** (sub-4 no puede proponer un alérgeno hoy: no hay restricciones capturadas).
**MAYOR pendiente:** endurecer `findViolations` (normalización de plurales + cobertura de sinónimos +
categorías) **antes** del slice que capture alergias/intolerancias — es exactamente donde el filtro en
código debe ser hermético y hoy tiene huecos probados. No toqué producción.
