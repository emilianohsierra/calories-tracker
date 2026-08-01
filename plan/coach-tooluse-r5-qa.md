# QA focalizado — Coach tool-use sub-5: `cambiar_plan` (cambiar OBJETIVO)

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Revisión por código + `vitest` (50/50).**
Archivos: `lib/coach/actions.js` (`cambiarObjetivo`), `app/api/coach/chat/route.js`,
`app/coach/page.js`. (`app/api/profile/route.js` **no** se modificó.)

---

## VEREDICTO: ✅ LISTO-PARA-DEPLOY

Los 6 puntos pasan. Propone→confirma→aplica con números del motor, guardas correctas, fresh-only,
Opción A (sin override manual) y cero regresión. Sin issues bloqueantes.

## (1) FLUJO propone → confirma → aplica — ✅
- 'cambia a hipertrofia' → el modelo llama `cambiar_plan` (elige el enum) → **`cambiarObjetivo`
  SÍNCRONO (sin IA)** fusiona `{...profile, coach: objetivo}` → `computeTargets` → devuelve
  `planChange = {objetivo, prev, next}` **sin escribir** (verificado: 0 `insert/upsert/update/rpc`).
- La ruta devuelve `planChange`; el cliente pinta **`PlanDiff prev→next`** (reusa el componente
  Ola 1 `@/components/PlanDiff`) + **[Aplicar cambio] / [Cancelar]**.
- **Aplicar** → `applyPlanChange` relee el perfil, hace `POST /api/profile` con `{...profile,
  coach}` (persiste + recomputa) y refresca `/api/coach/context`.
- **Confirmación ANTES de mutar:** la propuesta no escribe; solo Aplicar dispara el `POST`.

## (2) NÚMEROS DEL MOTOR — ✅
`prev = ctx.targets`; `next = computeTargets(perfil_merged)` (topes/pisos y **defaults seguros** de
cada coach; sin déficits agresivos — es la misma función Ola 1). El modelo **solo** elige el coach
(`objetivo` enum de 5: perdida_grasa/hipertrofia/runner/recomposicion/bienestar). Al aplicar, el
servidor recomputa vía `computeTargets` (POST /api/profile ignora macros del cliente). Cero números
del modelo.

## (3) GUARDAS — ✅ (no propone ni escribe)
`cambiarObjetivo` devuelve `ok:false` sin `planChange` cuando:
- **objetivo inválido** (fuera de `COACH_IDS`) → `objetivo_invalido`;
- **sin perfil / sin coach** → `sin_perfil`;
- **mismo objetivo** → `mismo_objetivo`.
En esos casos `planChange` queda null → no se pinta PlanDiff ni se escribe; el modelo compone una
respuesta normal (p.ej. "ya tienes ese objetivo"). `computeTargets` en `try/catch` → `compute` → tampoco propone.

## (4) FRESH-ONLY — ✅ (doble seguro)
El bloque PlanDiff+Aplicar se renderiza con `{m.planChange && !m.fromHistory && …}`. Al recargar,
los mensajes traen `fromHistory:true` → no se reofrece Aplicar. Además, `planChange` **no se
persiste** (el mensaje guardado es solo el `response` JSON), así que en historial `m.planChange` es
undefined de todos modos. Una propuesta no aplicada desaparece al recargar (por diseño).

## (5) "SUBE MI PROTEÍNA" (Opción A) — ✅
No existe ninguna vía de override manual de macros: `cambiarObjetivo` solo acepta `objetivo`, y
`POST /api/profile` fija los targets **solo** vía `computeTargets`. El `description` de la tool
instruye: "la proteína la fija el objetivo; si pide más proteína, ofrécele cambiar a un objetivo con
más proteína". → el coach explica y ofrece cambiar de coach; sin override. Diseño lo garantiza.

## (6) NO-REGRESIÓN — ✅
- **Una acción por turno:** `canAct = !guardado && !estimate && !actualizado && !opciones &&
  !planChange`; dispatch foto>texto>cena>plan>ctx. Branches previos sin cambios.
- **POST /api/profile IGUAL:** el archivo **no está** en el diff; `applyPlanChange` reusa el mismo
  endpoint de editar-perfil (sin ruta nueva). La UI de editar-perfil intacta.
- **cap/reembolso/personalidad/rediseño/foto/texto/generar_cena/actualizar:** sin cambios. El
  reembolso no se dispara si hubo propuesta (titular forzado "¿Lo aplico?").
- `app/coach/page.js` = wiring de PlanDiff + bump `BUILD` v16→v17.

---

## 🟢 Notas (no issues)
- **Anti-doble-aplicar:** `applyPlanChange` con `if (busy) return` + botón `disabled={busy}`; al
  aplicar, `planChange→null` para ese mensaje (desaparecen los botones). Y `POST /api/profile` es
  upsert por `user_id` (recomputa el mismo target) → aplicar dos veces no duplica ni corrompe (a
  diferencia del `insert` de meals). Robusto.
- **Apply usa perfil FRESCO:** relee el perfil antes de POSTear, así el resultado aplicado siempre
  es correcto aunque la propuesta mostrada fuera de una lectura anterior. `PlanDiff` tolera `prev`
  null (usuario sin targets previos) sin romper.

## Resumen para el Director
| Check | Estado |
|---|---|
| 1 · Propone (sync, sin IA, sin escribir) → PlanDiff + Aplicar/Cancelar → POST /api/profile; confirma antes de mutar | ✅ |
| 2 · Números del motor (computeTargets, topes/pisos); modelo solo elige coach (enum 5) | ✅ |
| 3 · Guardas objetivo inválido/mismo/sin-perfil → no propone ni escribe | ✅ |
| 4 · Fresh-only (fromHistory + planChange no persistido) | ✅ |
| 5 · "más proteína" → explica + ofrece cambiar coach; sin override manual (Opción A) | ✅ |
| 6 · No-regresión; POST /api/profile idéntico (mismo endpoint de editar-perfil) | ✅ |

**LISTO-PARA-DEPLOY.** No toqué producción.
