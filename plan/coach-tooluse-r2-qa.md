# QA focalizado — Coach tool-use sub-2: `registrar_texto` + fix doble-alta

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Revisión por código + `vitest` (35/35 pasan, incl. `registrarTexto`).**
Archivos: `app/api/coach/chat/route.js`, `lib/coach/actions.js`, `app/coach/page.js`,
`components/coach/cards/MealCard.js`, `lib/coach/actions.test.js`.

---

## VEREDICTO: ✅ LISTO-PARA-DEPLOY

El cambio a `tool_choice: auto` no rompe el chat normal, el registro por texto **propone** con
números del backend antes de mutar, y el **fix de doble-alta cierra el hueco al recargar** (crítico).
Solo persiste 1 nit conocido (idempotencia server-side, no bloqueante).

---

## (1) CAMBIO DE COMPORTAMIENTO (forzar-responder → AUTO) — ✅
- **Chat normal = 1 vuelta:** con `auto`, el modelo llama `responder` en el step 0 → break. Si
  emitiera texto libre, el fallback lo envuelve como `responder` (nunca Markdown crudo). 1 vuelta.
- **"No registra de más" (clave):** `registrar_texto` **solo PROPONE** (no escribe en BD; ver §2).
  Aunque `auto` + la tool esté disponible en todo turno, un falso positivo solo genera una
  **propuesta** (MealCard) que la persona ignora/descarta — **cero mutación** no deseada. El
  `description` de la tool ("no en charla general") reduce falsos positivos.
- **"registrame 2 tacos":** el modelo llama `registrar_texto` → grounding → propone MealCard.

## (2) REGISTRAR POR TEXTO (números del backend, confirmación antes de mutar) — ✅
- `registrarTexto` (`lib/coach/actions.js`) hace una **llamada de grounding SEPARADA**
  (`estimarComida`, tool estructurada `estimar_comida`) y **NO escribe en BD** (verificado: sin
  `insert`/`rpc`; test "estima y PROPONE (no escribe) con números del grounding").
- La ruta **fuerza** el bloque `meal` con los números de `estimate.*` (backend), no lo que
  reescriba el chat (`route.js` `if (estimate) response.bloques = [{tipo:'meal', kcal: estimate.kcal…}]`).
- **Confirmación antes de mutar:** la MealCard fresca trae botón **Registrar** → `onRegisterMeal`
  → `POST /api/meals` (`confidence:'estimado'`). La mutación ocurre solo al confirmar.
- Alérgeno: se marca (`alerta_alergeno`) pero no bloquea (es una propuesta).

## (3) FIX DOBLE-ALTA (crítico) — ✅ CERO doble alta
- **Al recargar:** `GET /api/coach/history` → los mensajes se mapean con `fromHistory:true`
  (`app/coach/page.js`). Al render, `MessageRenderer` recibe
  `onRegisterMeal={m.fromHistory ? undefined : onRegisterMeal}`. Sin `onRegister`, `MealCard`
  pinta el rótulo **"Estimado"** en vez del botón → **no re-registrable**. ✓
- **Propuesta fresca:** el mensaje vivo (sin `fromHistory`) sí trae `onRegisterMeal` → botón
  Registrar; tras guardar, `state='done'` → **"Registrado ✓" disabled** (`disabled={state!=='idle'}`).
- **Doble-tap:** `MealCard.register` corta con `if (state !== 'idle') return` + `setState('saving')`
  y el botón queda `disabled` → segundo tap bloqueado → 1 solo insert.
- **Resultado:** una comida registrada por texto se inserta **una vez** (fresca) y al recargar su
  tarjeta es "Estimado" (sin acción) → imposible re-registrar. CERO doble alta por recarga y por
  doble-tap.

## (4) NO-REGRESIÓN — ✅
- **Foto (sub-1) intacta:** `registrarComidaFoto` sin cambios; en el loop la foto tiene prioridad
  (`fotoAction` antes que `textoAction`); su propuesta es cliente-transitoria (no se persiste como
  card accionable) → sin doble-alta al recargar.
- **Cap intacto:** `consumir_ia` sigue **antes** de la llamada a Anthropic; `free_limit→402`,
  `kill/global→503`. Reembolso (`reembolsar_ia`) igual: si no hubo respuesta ni mutación → reembolsa.
- **Personalidad / historial / rediseño:** sin cambios.

## (5) TOPES — ✅
- `MAX_STEPS=4` + `TIME_BUDGET_MS=45000` (break al inicio de cada paso) → corte gracioso, sin
  runaway. Tras cualquier acción, `tools=[RESPONDER_TOOL]` + `tool_choice` forzado a responder →
  cierra en 1 paso más (evita repetición).
- **Llamadas Haiku por turno:** normal = 1 (responder). Registro por texto = ~3 (paso que llama
  `registrar_texto` + grounding `estimarComida` + paso responder). Foto = 2 (acción sin llamada
  extra + responder). Techo duro: `MAX_STEPS`(4) llamadas de chat + 1 grounding, acotado por 45s.
  Coincide con "<=3 acotadas" en el caso normal. **1 crédito de chat cubre el turno completo**
  (varias llamadas internas Haiku, todas baratas y acotadas).

---

## 🟡 Nits (no bloquean)

- **N1 (carryover, defensa en profundidad):** `/api/meals` sigue **sin idempotencia server-side**.
  El anti-doble-alta se apoya en guards del cliente — ahora **más robusto** (rótulo "Estimado" en
  historial + `state`/`disabled` en la card fresca), que cierran recarga y doble-tap normal. Un
  doble-`POST` en el mismo tick (o por API directa) aún insertaría dos veces. Recomiendo una
  idempotency key en un slice futuro. Riesgo práctico bajo (dato propio, con cap).
- **N2 (costo/informativo):** un turno de registro por texto gasta ~3 llamadas Haiku por 1 crédito
  de chat (grounding incluido). Acotado por `MAX_STEPS`+45s+airbag global; Haiku es barato. Solo lo
  anoto para dimensionar el gasto del feature.
- **N3 (calidad, bajo):** con `auto` + `registrar_texto` siempre disponible, un mensaje ambiguo
  ("comí horrible ayer") podría disparar una propuesta espuria (gasta 1 grounding + muestra una card
  que se descarta) — **sin** escritura en BD. El `description` de la tool lo mitiga.

---

## Resumen para el Director
| Check | Estado |
|---|---|
| 1 · auto: chat normal 1 vuelta, no registra de más; "registrame X" propone | ✅ |
| 2 · Texto: grounding separado (números backend) → propone → confirmar registra (POST /api/meals) | ✅ |
| 3 · Fix doble-alta: historial = "Estimado" sin botón; fresca registra y pasa a Registrado disabled | ✅ CERO doble alta |
| 4 · No-regresión: foto sub-1, cap/402, reembolso, personalidad, historial, rediseño | ✅ |
| 5 · Topes MAX_STEPS=4 + 45s; <=3 Haiku acotadas | ✅ |

**LISTO-PARA-DEPLOY.** Recomiendo (no bloqueante) idempotency key server-side para el registro en un
slice futuro (N1). No toqué producción.
