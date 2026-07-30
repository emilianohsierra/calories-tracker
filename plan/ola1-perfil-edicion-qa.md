# QA focalizado — Ola 1 · Editar perfil/plan

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Doc:** `plan/ola1-perfil-edicion-spec.md`. Revisión por código + `vitest` (12/12 pasan).
Archivos: `app/perfil/page.js` (nuevo), `components/PlanDiff.js` (nuevo),
`app/api/profile/route.js` (mod), `app/page.js` (mod), `lib/nutrition/{coaches,compute}.js`,
`supabase/ola1.sql`.

---

## VEREDICTO: ⛔ NO-LISTO — 1 BLOQUEANTE (falla el check explícito de "Recomposición")

No hay regresión ni pérdida de datos, y la edición de los 4 coaches originales funciona. Pero
**cambiar a "Recomposición" NO se puede guardar**: revienta con 500 por un desajuste
código↔base de datos. Es exactamente uno de los casos que pediste validar. Fix chico pero
obligatorio antes de la beta.

---

## 🔴 BLOQUEANTE

### B-R1 — "Recomposición" está en el motor y la UI, pero el CHECK de la BD lo rechaza → 500 al guardar.
El coach `recomposicion` está **completo** en el backend de cálculo:
- `lib/nutrition/coaches.js:44-55` lo define (prot 2.2, déficit por %grasa).
- `lib/nutrition/compute.js:89` tiene su rama; los 12 tests de `vitest` lo cubren y pasan.
- `app/api/profile/route.js:65` lo acepta (`COACH_IDS` ya lo incluye).
- `app/perfil/page.js:15` lo ofrece como opción.

**PERO** `supabase/ola1.sql:22` sigue con el CHECK viejo:
```sql
coach text not null check (coach in ('perdida_grasa','hipertrofia','runner','bienestar'))
```
→ **no incluye `recomposicion`.**

- **Reproducir:** en `/perfil`, elegir **Recomposición** → "Guardar y recalcular". El `upsert` a
  `nutrition_profiles` (route.js:113) viola el CHECK (Postgres 23514) → `pErr` → **500 "No se pudo
  guardar tu perfil"**. El plan NO se guarda. (El error ocurre en el guardado del perfil, antes
  incluso de `computeTargets`, así que el cálculo correcto del motor no llega a persistir.)
- **Impacto:** el objetivo estrella "Recomposición" es una opción muerta en producción; el usuario
  cree que la eligió y recibe un error. Falla el criterio de aceptación del brief ("cambiar a
  Recomposición calcula bien").
- **Mitigación (obligatoria):** agregar `recomposicion` al CHECK. ⚠️ **OJO operativo:** `ola1.sql`
  usa `create table if not exists`, así que **editar el CREATE no arregla las bases ya creadas**
  (la tabla existe desde R1/R2). Hay que enviar un ALTER explícito e idempotente:
  ```sql
  alter table public.nutrition_profiles drop constraint if exists nutrition_profiles_coach_check;
  alter table public.nutrition_profiles add  constraint nutrition_profiles_coach_check
    check (coach in ('perdida_grasa','hipertrofia','runner','bienestar','recomposicion'));
  ```
  (y actualizar también el CREATE para instalaciones nuevas). Sin el ALTER, la beta existente
  seguirá rota aunque se edite el CREATE.

---

## (1) NO-REGRESIÓN — ✅ OK

- `app/page.js`: el link **"Editar mi plan"** (`:188`) solo aparece cuando `profile && targets`;
  puramente aditivo. HOME/onboarding/soft-gate intactos.
- `app/api/profile/route.js`: el POST solo **añade** una lectura de `nutrition_targets` previa
  (`:112-118`) y devuelve `targets_prev`; misma validación, mismo `upsert`. GET sin cambios.
  analyze / meals / summary / settings / usage / Stripe / login **sin tocar**.
- `/perfil` sin perfil → `router.replace('/onboarding')` (`page.js:41`); protegido por el
  middleware de sesión.

## (2) EDICIÓN (coaches válidos) — ✅ OK

Precarga los valores actuales desde `GET /api/profile` (`page.js:44-58`), permite cambiar
objetivo/sexo/edad/peso/altura/actividad/params, y al guardar reusa `POST /api/profile` →
`computeTargets` recomputa y persiste. **`PlanDiff`** (`components/PlanDiff.js`) muestra
`prev → next` con delta por fila (kcal/P/C/G) usando `targets_prev` del backend. Correcto para
perdida_grasa, hipertrofia, runner y bienestar.

## (3) NO PÉRDIDA DE DATOS — ✅ CONFIRMADO

El `POST /api/profile` solo hace `upsert` (onConflict `user_id`) sobre `nutrition_profiles` y
`nutrition_targets`. **No toca** `meals`, `user_settings`, `usage_counters`, `subscriptions` ni
Storage. La racha/historial/comidas no viven en esas 2 tablas → editar el plan **no** las borra.
El `upsert` actualiza la fila existente (no inserta duplicado, no borra).

## (4) BORDES — ✅ (salvo B-R1)

- **Guardar sin cambios (diff vacío):** recomputa el mismo input → misma salida; `PlanDiff`
  detecta `changed=false` (`PlanDiff.js:14`) → muestra "Tu plan" sin deltas ruidosos. Sin error.
- **Inputs inválidos:** el server valida (route.js:49-84) → **400** "Datos inválidos: …" y la UI
  lo muestra (`page.js:92,115`). CHECKs de BD como segunda línea.
- **Recomposición calcula bien (matemática):** el motor sí la calcula correctamente (tests verdes)
  — el problema es SOLO la persistencia (B-R1). Una vez arreglado el CHECK, queda funcional.

---

## 🟡 MENORES (backlog)

- **M-R1 (UX):** si `GET /api/profile` falla al cargar `/perfil`, se hace `setError` pero el render
  `if (loading || !f)` (`page.js:103`) regresa la vista "Cargando tu perfil…" **antes** del banner
  de error (`f` sigue null) → la pantalla queda en "Cargando…" sin mostrar el error ni reintento.
  Recuperable recargando. Sugerencia: mostrar error/retry cuando `!loading && !f`.
- **M-R2 (spec, cosmético):** la pantalla es un formulario plano, no las "secciones tipo ajustes +
  Sheet" del spec; y el `% grasa` solo es editable bajo Recomposición. No es bug; desviación de
  diseño a anotar.

---

## Resumen para el Director
| Área | Estado |
|---|---|
| NO-regresión (HOME/onboarding/analyze/meals/Stripe/login) | ✅ |
| Edición de coaches válidos + recompute + PlanDiff prev→next | ✅ |
| No pérdida de datos (racha/historial/meals intactos) | ✅ |
| Diff vacío / inputs inválidos (400) | ✅ |
| **Cambiar a Recomposición** | ⛔ **500 (B-R1: CHECK de BD sin `recomposicion`)** |

**No desplegar a beta hasta cerrar B-R1** (agregar `recomposicion` al CHECK **con ALTER**, no solo
en el CREATE). Es el único bloqueante; lo demás está listo. Recomiendo también M-R1 en el mismo
empuje por ser trivial.
