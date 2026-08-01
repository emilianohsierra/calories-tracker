# QA focalizado — Coach tool-use sub-R1: `registrar_comida_foto` desde el chat

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Revisión por código + `vitest` (32/32 pasan, incl. `actions.test.js`).**
Archivos: `app/api/coach/chat/route.js`, `lib/coach/actions.js`, `lib/meals/insert.js`,
`app/coach/page.js`, `app/api/meals/route.js`.

---

## VEREDICTO: ✅ LISTO-PARA-DEPLOY

Los 7 puntos pasan. El cap de dinero sigue intacto, la mutación nueva confirma antes de escribir,
usa números de visión y no doble-cobra ni doble-registra en los flujos normales. Solo 2 nits
menores (no bloquean).

---

## (1) NO-REGRESIÓN chat normal — ✅
Sin foto, `send()` no manda `pendingAnalysis` → el server pone `tools=[RESPONDER_TOOL]` y
`tool_choice` **forzado a responder** → el loop cierra en **1 paso** (turno único, idéntico a hoy).
El cap (`consumir_ia` en `route.js:238`, **antes** de Anthropic; `free_limit→402`,
`kill/global→503`), el reembolso, la personalidad, el historial y el rediseño **no cambian**.

## (2) FLUJO foto → registro (con confirmación) — ✅
- `+`/Analizar → `onPickFile` → downscale → `POST /api/analyze` (1 crédito análisis). 429/402 →
  UpgradeModal; error/`es_comida=false` → burbuja de error.
- Éxito → **tarjeta PROPUESTA** en el chat ("Esto detecté en tu foto. ¿Lo registro?") con
  **Registrar / Descartar** → **confirmación ANTES de mutar** (nada se escribe hasta el clic).
- Registrar → `confirmRegister` → `send('Registra la comida de la foto.', analysis)` con
  `pendingAnalysis` → loop tool-use → `registrar_comida_foto` → `registrarComidaFoto` inserta.
- **Números de visión, no del modelo:** `registrarComidaFoto` toma `calorias/proteinas_g/...` del
  `pendingAnalysis` (salida de `/api/analyze`, saneada por `sanitizePendingAnalysis` y validada por
  `validateMeal`). El modelo solo aporta `momento`/`correccion`; jamás los macros.

## (3) SIN DOBLE ALTA + anti-doble-clic — ✅
- **Server:** `action = !guardado && pendingAnalysis ? …` → el registro corre **una sola vez**;
  tras registrar, `tools=[RESPONDER_TOOL]` (ya no se ofrece la tool) → no re-registra en el turno.
- **Cliente:** al confirmar, `confirmRegister` **quita la tarjeta** (`filter(!x.proposal)`) y la
  `MealCard` tiene guard `state !== 'idle'`; `send()` corta si `busy`. La tarjeta se desmonta →
  no hay segundo clic.
- **Retry no re-registra:** `retry()` reenvía `lastUser.content` **sin** `analysis` → el server no
  recibe `pendingAnalysis` → no inserta de nuevo (si el insert ya ocurrió y se perdió la respuesta,
  el reintento es un chat normal, no una 2ª alta).

## (4) TIMEOUT (45s / MAX_STEPS=4) — ✅
- El loop corta con gracia: `if (Date.now()-t0 > TIME_BUDGET_MS) break` al inicio de cada paso; y
  `MAX_STEPS=4` acota las vueltas → nunca a medias ni infinito.
- **Registró pero el modelo no cerró** (corte por tiempo/pasos): se **sintetiza** la confirmación con
  números del backend (`guardado.titulo/kcal`), **sin reembolso** (`route.js:345`).
- **No hubo valor** (ni respuesta ni mutación): **reembolsa** (`route.js:353-359`). Correcto.

## (5) ALÉRGENO marca pero NO bloquea — ✅
`registrarComidaFoto` inserta siempre; calcula `findViolations(ingredientes, alergias+intolerancias)`
en **código** y devuelve `alerta_alergeno`/`alergenos` en el `tool_result` para que el coach lo
mencione. El registro no se bloquea (la persona registra lo que comió).

## (6) COSTO 1 foto registrada = 1 análisis + 1 chat — ✅
- `/api/analyze` → `consumir_analisis` (1 crédito análisis) al adjuntar.
- Confirmar → `/api/coach/chat` → `consumir_ia` (1 crédito chat).
- Descartar tras analizar: gasta el crédito de análisis (el análisis sí ocurrió) y **0** chat —
  correcto/esperado. Registrar = exactamente 1 + 1.

## (7) `/api/meals` idéntico tras extraer `validateMeal` — ✅
`lib/meals/insert.js` `validateMeal` es la **misma** lógica byte-a-byte (fecha/hora/título/calorías
0-10000, `num()` = `round(*10)/10` clamp ≥0, `meal_type` fallback 'comida', ingredientes slice 20,
etc.). La ruta ahora hace `insert({ user_id, ...v.row })`. Mismos campos, mismos 400. Reusada por el
ejecutor de la tool → una sola fuente de verdad (sin drift). Cubierto por `actions.test.js`.

---

## 🟡 Nits (no bloquean)

- **N1 (defensa en profundidad):** no hay idempotencia server-side en el `insert` de `meals`; el
  anti-doble-alta se apoya en guards del cliente (desmontar la tarjeta + `state` de `MealCard` +
  `busy`). En flujos normales no hay doble alta, pero dos `POST` concurrentes con el mismo
  `pendingAnalysis` (p.ej. doble-tap muy rápido antes del re-render) insertarían dos veces. Igual que
  el `request_id` server-minted del chat, es un patrón a endurecer con una idempotency key del
  cliente. Riesgo práctico bajo.
- **N2 (informativo):** los macros vienen del `pendingAnalysis` que **manda el cliente** (saneado y
  acotado por `sanitizePendingAnalysis`+`validateMeal`), no re-consultados del server. Es data propia
  del usuario y con el cap aplicado → sin vector de costo/seguridad; solo lo anoto para que "números
  de visión" se lea con precisión (van por el roundtrip del cliente, ya acotados).

*(Nota positiva: el copy del error genérico ya dice "No pude responder ahora" — corregido el nit N1
de mi review anterior del rediseño.)*

---

## Resumen para el Director
| Check | Estado |
|---|---|
| 1 · Chat normal sin regresión (turno único, cap/reembolso/persona/historial/rediseño) | ✅ |
| 2 · Foto→/analyze→propuesta Registrar/Descartar (confirma antes de mutar) · números de visión | ✅ |
| 3 · Sin doble alta + anti-doble-clic | ✅ (client-guarded; ver N1) |
| 4 · Timeout 45s con gracia · sintetiza si registró · reembolsa si no hubo valor | ✅ |
| 5 · Alérgeno marca pero no bloquea | ✅ |
| 6 · Costo 1 foto = 1 análisis + 1 chat | ✅ |
| 7 · /api/meals idéntico tras extraer validateMeal | ✅ |

**LISTO-PARA-DEPLOY.** Recomiendo (no bloqueante) una idempotency key para `registrar_comida_foto`
en un slice futuro (N1). No toqué producción.
