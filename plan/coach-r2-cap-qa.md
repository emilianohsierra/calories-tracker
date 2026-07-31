# QA focalizado — Coach R2 (personalidad + saludo) + CAP DE COSTO DURO

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Doc:** `plan/coach-fase1-implementacion.md`. Revisión por código + `vitest` (**19/19 pasan**).
Archivos: `app/api/coach/{chat,context,settings,history}/route.js`, `lib/coach/{context,persona}.js`,
`components/coach/PersonalityPicker.js`, `app/coach/page.js`, `app/page.js`, `supabase/coach.sql`.

---

## VEREDICTO: ✅ LISTO-PARA-DEPLOY-BETA

El **cap de costo** —lo crítico— está correctamente implementado y aplicado en TODAS las
dimensiones que pediste. No hay regresión. Personalidad y saludo determinista OK. Quedan 3
MENORES de hardening (no bloquean; recomiendo M-C1 pronto).

---

## (1) EL CAP — ✅ verificado dimensión por dimensión

Mismo patrón atómico probado de `consumir_analisis`, ahora en `consumir_ia(request_id, feature)`
(`coach.sql:125`) + `reembolsar_ia`.

- **Free = EXACTAMENTE 3/mes.** `chat_free_limit` default 3. La reserva atómica
  `insert…on conflict do update set count=count+1 where count < v_limit` deja pasar 1,2,3 y en la
  4ª (`count=3`, `3<3` falso → `not found`) devuelve `free_limit`. Verificado el conteo exacto.
- **4ª → 402 SIN gasto de IA.** `chat/route.js:43-52` responde 402 **antes** de crear el stream de
  Anthropic (`:97`). Cero tokens. El cliente lo convierte en `UpgradeModal` (`app/coach/page.js:59`).
- **Pro ilimitado.** `v_plan='premium' → v_limit=null` → la reserva nunca bloquea (`coach.sql:158`).
- **kill_switch → 503.** `chat_kill_switch=true → reason 'kill_switch'` → route 503 genérico (no
  filtra detalle). `global_cap` también cae a 503. `coach.sql:153`, `route.js:50-51`.
- **Airbag global.** `chat_global_cap` default 20000; reserva global atómica; si se excede, revierte
  la reserva del usuario y devuelve `global_cap` (`coach.sql:173-183`).
- **Reembolso si el stream falla SIN texto.** `route.js:123` — `if (!full) reembolsar_ia`. Si ya hubo
  texto (Anthropic facturó) NO reembolsa. Correcto.
- **Límite server-side imposible de falsificar.** Los números salen de `app_config` DENTRO de la
  función `SECURITY DEFINER` (`search_path=''`, `auth.uid()` interno); `consumir_ia` solo recibe
  `request_id`+`feature`. RLS: `ai_usage` select-own; `ai_global_usage`/`ai_usage_events`/`app_config`
  sin acceso cliente. Llamar `/api/coach/chat` directo igual pasa por el cap.
- **No auto-reembolso.** El `request_id` se genera en el server (`route.js:34`) y **nunca** se
  devuelve al cliente → un usuario no puede llamar `reembolsar_ia` con un id válido para inflar su
  cuota. `reembolsar_ia` además es idempotente (`refunded` flag) y solo toca eventos propios.

## (2) NO-REGRESIÓN — ✅

- Todo bajo `/api/coach/*` + `app/coach/*` + `lib/coach/*` (aditivo). El botón "Habla con Mi Coach"
  en `app/page.js` es additivo.
- `consumir_ia`/`reembolsar_ia` son funciones **nuevas**; `consumir_analisis` y el candado Free de
  10 análisis **no se tocan**. analyze/meals/profile/Stripe/HOME/onboarding/editar-perfil intactos.
- `coach.sql` es aditivo: crea tablas nuevas y hace `alter table app_config add column if not exists`
  (rellena la fila existente con los defaults 3/20000). No altera columnas ni funciones previas.
  *(Nota menor: el doc dice "no toca app_config", pero sí le agrega 3 columnas — aditivo, sin riesgo.)*

## (3) PERSONALIDAD + SALUDO — ✅

- **Cambiar tono NO recalcula el plan.** `POST /api/coach/settings` (`settings/route.js:26-29`) solo
  hace `update nutrition_profiles set tone=…`; no llama `computeTargets` ni toca `nutrition_targets`.
  `PersonalityPicker` persiste vía ese endpoint y solo refleja el cambio si `res.ok`.
- **Saludo determinista (0 IA) con números correctos.** `GET /api/coach/context` y
  `greetingText` (`app/coach/page.js:9`) calculan pendientes = `targets − Σ meals(hoy)` (clamp ≥0),
  sin llamar a Anthropic. `persona.js` inyecta las metas del motor y prohíbe inventar cifras.

## (4) BORDES

- **Sin perfil:** el chat responde igual (contexto sin metas, `?? 0`); el saludo cae al genérico
  (`has_profile:false`). El cap funciona porque lee `profiles.plan` (fila que siempre existe por el
  trigger de signup), no `nutrition_profiles`. Sin crash.
- **Sin `coach.sql` corrido (columnas `chat_*` ausentes):** `consumir_ia` falla al leer app_config →
  `gErr` → **500 y chat deshabilitado, sin gasto de IA** (fail-closed, SEGURO).
- **Red caída a mitad del stream:** si Anthropic corta antes de texto → reembolso; si corta con texto
  parcial → 1 crédito (facturado), sin doble cobro. Ver M-C3 para el matiz de desconexión del cliente.

---

## 🟡 MENORES (backlog, no bloquean la beta)

- **M-C1 (hardening del cap):** si la **fila** de `app_config` (id=true) estuviera **ausente** (no las
  columnas, la fila entera), `consumir_ia` obtiene `v_free = NULL` → un usuario Free se trata como
  **ilimitado** (fail-OPEN) → cap anulado. Es improbable (la fila está sembrada y RLS impide borrarla),
  pero es justo el escenario que el cap debe cubrir. Sugerencia: si `v_free` es NULL para un plan free
  → denegar (fail-closed) o usar un default duro pequeño. *(Ojo: columnas ausentes = fail-closed 500,
  eso ya es seguro; esto es solo el caso de fila ausente.)*
- **M-C2 (idempotencia — precisión):** el `request_id` se genera en el server por POST, así que la
  idempotencia del ledger **no** cubre un "reintento" del cliente (cada POST = id nuevo = cobro nuevo).
  En la práctica está **mitigado por la UI**: el compositor se `disabled={busy}` y `send()` corta si
  `busy`, así que no hay doble-envío concurrente; y un doble-disparo por API directa solo gasta la
  cuota propia. Para una garantía dura, usar un **idempotency key generado por el cliente**.
- **M-C3 (costo menor):** si el cliente se desconecta a mitad del stream, el server no aborta la
  llamada a Anthropic (no se cablea `request.signal`) → se factura la salida completa que el usuario
  ya no verá. Sigue siendo 1 crédito (no rompe el cap), solo costo ligeramente desperdiciado.

---

## Resumen para el Director
| Check crítico | Estado |
|---|---|
| Free = exactamente 3/mes | ✅ |
| 4ª → 402/UpgradeModal sin gasto de IA | ✅ |
| Pro ilimitado | ✅ |
| kill_switch → 503 · airbag global | ✅ |
| Reembolso si el stream falla sin texto | ✅ |
| Límite server-side infalsificable (RPC directa incluida) | ✅ |
| No auto-reembolso (request_id no expuesto) | ✅ |
| No-regresión (analyze/meals/profile/Stripe/HOME/onboarding/perfil) | ✅ |
| Tono cambia sin recalcular · saludo determinista con números correctos | ✅ |
| Bordes sin perfil / sin coach.sql (fail-closed) / red caída | ✅ |

**LISTO-PARA-DEPLOY-BETA.** Recomiendo M-C1 (fail-closed si falta la fila de config) en el mismo
empuje por ser barato y cerrar el único hueco teórico del cap. No toqué producción.
