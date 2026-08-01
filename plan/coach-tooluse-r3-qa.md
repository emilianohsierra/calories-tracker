# QA focalizado — Coach tool-use sub-3: `actualizar_contexto_dia` (estado del día)

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Revisión por código + `vitest` (39/39 pasan, incl. `actualizarContextoDia`).**
Archivos: `supabase/coach-day-state.sql` (nuevo), `lib/coach/actions.js`, `lib/coach/context.js`,
`lib/coach/persona.js`, `app/api/coach/chat/route.js`, `app/coach/page.js`.

---

## VEREDICTO: ✅ LISTO-PARA-DEPLOY

Aditivo, degradación graciosa sin el SQL, lógica correcta (agua suma / resto absoluto / preserva
campos / valida y rechaza), contexto inyectado, RLS propia, y **cero regresión**. Solo 1 nit de
consistencia (no bloqueante).

---

## (1) DEPLOY-SAFE sin el SQL — ✅ el chat sigue vivo
- **Lectura (`context.js`):** el `select` a `coach_day_state` va en el `Promise.all`; supabase-js
  **resuelve** con `{data:null, error}` si la tabla no existe (no rechaza) → `dayState=null` →
  `contexto_dia` omite la línea de estado. **No lanza.** El contexto se arma igual.
- **Escritura (`actions.js`):** si el `upsert` falla (tabla ausente) → `actualizarContextoDia`
  devuelve `{ ok:false, error:'db' }` (no `throw`). El loop igual **fuerza `responder`** → el
  modelo compone una respuesta → **el chat responde con normalidad.** `actualizado` queda null.
- **Confirmado:** con el SQL sin correr, ni la lectura ni la escritura rompen el chat.

## (2) LÓGICA — ✅ (test-cubierta)
- **agua = SUMA:** `row.agua_ml = (cur?.agua_ml ?? 0) + valor` (evento incremental, ml que acaba de
  tomar). Test: 250 + 500 = **750**.
- **Resto absoluto:** `entreno_estado/sueno_h/estres/hora_comida` → `row[campo] = valor`.
- **Upsert PRESERVA los demás (read-modify-write):** lee `cur` y arma `row` con los valores
  actuales de los campos no tocados antes del `upsert` (evita el reset-a-default del upsert parcial
  de PostgREST). Test: al tocar agua, `entreno_estado='hecho'` se conserva.
- **NL→enum:** `parseCampoValor` mapea entreno (`ya entrené`→`hecho`, `salté`→`omitido`,
  `pendiente`) y estrés (`tenso`→`alto`, `tranquilo`→`bajo`, `normal`→`medio`).
- **hora HH:MM:** regex `^(\d{1,2}):(\d{2})$` + `h<24 && mi<60`, zero-pad.
- **Rechaza sin escribir:** `campo` fuera de `CAMPOS` → `campo_invalido`; `valor` que parsea a null
  (agua ≤0/>5000, sueño fuera 0-24, enum no reconocido, hora inválida) → `valor_invalido`. En ambos
  **no hay `upsert`.** Test cubre `campo:'foo'` → inválido.

## (3) CONTEXTO — ✅ el coach lo conoce y no re-pregunta
`persona.js contextoDiaBlock` añade, solo si hay datos, la línea
`Estado de hoy: agua N ml · entreno X · sueño Y h · estrés Z · hora de comida HH:MM.` dentro de
`<contexto_dia>`. `assembleContext` pasa `ctx.today.estado = dayState`. El coach ve el estado en cada
turno → no vuelve a preguntar lo ya anotado.

## (4) ESCRITURA DIRECTA sin confirmación UI — ✅ (aprobado)
`actualizar_contexto_dia` ejecuta y escribe en el loop del backend, **sin** MealCard/confirmación
(a diferencia de registrar comida). Correcto para dato menor. Tras actuar se fuerza `responder`;
si el modelo no cierra, se sintetiza "Anotado." (`route.js:446`) → **no cae al reembolso** (hubo
mutación). Un write fallido (tabla ausente) deja `actualizado=null` pero el modelo igual responde.

## (5) RLS — ✅ solo el propio usuario
`coach_day_state` con RLS activa y políticas `select/insert/update` **`to authenticated using
(user_id = auth.uid())`** (+ `with check` en insert/update). Sin política DELETE ni `to anon` →
anon y borrado quedan denegados. La escritura corre bajo la sesión del usuario → solo su fila.

## (6) NO-REGRESIÓN — ✅
- **chat/foto/texto:** el dispatch mantiene el orden foto > texto > ctx con `canAct = !guardado &&
  !estimate && !actualizado` (una acción por turno). Los branches foto/texto **sin cambios**.
- **cap:** `consumir_ia` sigue **antes** de Anthropic (402/503). **Reembolso** igual (solo si no hubo
  respuesta **ni** mutación; `actualizado` cuenta como mutación → "Anotado" → no reembolsa).
- **rediseño:** sin cambios de UI (el estado del día no tiene tarjeta). `app/coach/page.js` = solo
  bump `BUILD` v14→v15.
- **No toca meals/profiles/targets/stripe:** el SQL crea **solo** `coach_day_state`; la acción solo
  toca esa tabla; el contexto lee las demás en solo-lectura (ya lo hacía).

---

## 🟡 Nit (no bloquea)
- **N1 (consistencia SQL):** `coach-day-state.sql` **omite** el `revoke all … from anon` y el
  `grant … to authenticated` explícitos que sí traen los otros schemas del coach. Funcionalmente es
  seguro (RLS con políticas solo `to authenticated` **deniega anon** al no tener política, y los
  grants por defecto de Supabase cubren la operación de `authenticated`), pero por consistencia y
  defensa en profundidad recomiendo añadir el `revoke anon` + `grant authenticated` explícitos.
- *(Carryover informativo N2: con `tool_choice auto`, un mensaje ambiguo podría disparar la tool,
  pero un valor no parseable → `valor_invalido` → no escribe. Sin efecto dañino.)*

---

## Resumen para el Director
| Check | Estado |
|---|---|
| 1 · Deploy-safe sin SQL (lectura null, escritura falla sin romper el chat) | ✅ |
| 2 · agua suma / resto absoluto / preserva campos / NL→enum / HH:MM / rechaza inválido sin escribir | ✅ (test) |
| 3 · Contexto "Estado de hoy…" inyectado → no re-pregunta | ✅ |
| 4 · Escritura directa sin confirmación UI | ✅ |
| 5 · RLS coach_day_state solo del propio usuario (auth.uid) | ✅ |
| 6 · No-regresión (chat/foto/texto/cap/reembolso/rediseño; no toca meals/profiles/targets/stripe) | ✅ |

**LISTO-PARA-DEPLOY.** Recomiendo (no bloqueante) añadir `revoke anon` + `grant authenticated`
explícitos al SQL por consistencia (N1). No toqué producción.
