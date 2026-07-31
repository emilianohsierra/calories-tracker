# Sub-5 · cambiar_plan = cambiar OBJETIVO/METAS (diseño para revisión)

**Autor:** Torvalds (CTO) · **Para:** Lugia (Director) · **Fecha:** 2026-07-31
**Corrección de alcance (Lugia):** `cambiar_plan` NO re-genera una comida (eso ya es `generar_cena`). Es **cambiar el objetivo/coach y/o las metas**, reusando `/api/profile` + `computeTargets` (motor determinista de Ola 1), **con confirmación UI** y **PlanDiff antes→después**. Ejemplos: "cambia mi objetivo a ganar músculo", "quiero recomposición", "sube mi meta de proteína".

## Piezas que se reusan (ya existen)
- `POST /api/profile`: valida + upsert de `nutrition_profiles` + `computeTargets` + persiste `nutrition_targets`; ya devuelve el plan y el previo para el diff. **La escritura real del plan pasa por aquí** (motor determinista, topes/pisos de seguridad incluidos).
- `computeTargets(profile)` (`lib/nutrition/compute.js`): perfil → metas. Respeta déficits máximos, pisos calóricos, macros por coach. **La IA nunca calcula metas.**
- `COACH_IDS`: perdida_grasa, hipertrofia, runner, recomposicion, bienestar.
- `components/PlanDiff.js`: pinta prev→next (kcal/prot/carb/grasa) con delta neutro.

## Flujo propuesto (propone → confirma → aplica)
1. La persona pide un cambio de objetivo ("cambia a hipertrofia"). El coach llama la tool `cambiar_plan`.
2. **Ejecutor (NO escribe):** toma `ctx.profile` (perfil actual), aplica el cambio de `coach` (+ params del coach si faltan → usa los del perfil o un **default seguro**), llama `computeTargets(perfilFusionado)` para las metas NUEVAS. Devuelve **PROPUESTA**: `{ prev_targets, next_targets, perfil_merged }`. Los números salen del MOTOR, no del modelo.
3. **Coach turn → responder** con una propuesta de plan. El cliente pinta **PlanDiff (prev→next)** + botones **[Aplicar cambio]** / **[Cancelar]** = **confirmación UI antes de mutar** (requisito para registrar/cambiar-plan).
4. **Al confirmar:** el cliente hace `POST /api/profile` con `perfil_merged` (reusa el endpoint determinista → persiste perfil + recomputa + guarda targets). Refresca contexto/saludo.

## Schema de la tool (nuevo — reemplaza el de comidas de Karpathy §4.4)
```json
{ "name": "cambiar_plan",
  "description": "Cambia el OBJETIVO/coach del usuario (y recalcula sus metas con el motor). Úsala cuando pida cambiar de objetivo (perder grasa, músculo, recomposición, runner, bienestar). No la uses para sugerir comidas.",
  "input_schema": { "type":"object","additionalProperties":false,
    "required":["objetivo","nota"],
    "properties":{
      "objetivo":{"type":"string","enum":["perdida_grasa","hipertrofia","runner","recomposicion","bienestar"]},
      "nota":{"type":"string","description":"Lo que pidió en sus palabras (p.ej. 'ganar músculo'). \"\" si no aplica."}
    } } }
```

## Params por coach que faltaran (mantenerlo simple)
`computeTargets` usa `coach_params` (ritmo perdida_grasa, experiencia hipertrofia, km runner). Si el coach nuevo necesita un param que el perfil no tiene:
- Reusar `profile.coach_params` existente si sirve; si no, aplicar un **default seguro** documentado (p.ej. hipertrofia→`experiencia: 'intermedio'`, perdida_grasa→`ritmo` por defecto del coach, runner→km actuales o 0), **siempre dentro de los topes del motor** (computeTargets ya los enforce). Mencionar en el mensaje que puede afinarlo en Perfil.
- Nunca empujar déficits agresivos: el motor lo impide y el tono del coach lo respeta.

## 🔶 Punto a decidir contigo: "sube mi meta de proteína"
El motor calcula la proteína de forma determinista (proteinPerKg × peso, por coach). NO hay override manual de macros por usuario. Opciones:
- **(A) Recomendada:** `cambiar_plan` maneja solo cambios de OBJETIVO/coach. Para "sube proteína", el coach explica que la proteína la fija el objetivo y ofrece cambiar a un coach con más proteína (p.ej. recomposición/hipertrofia). Respeta el motor, cero deuda.
- **(B):** añadir override manual de macros (columna nueva + que computeTargets lo respete con topes). Es más grande y mete una vía paralela al motor determinista.
Recomiendo **(A)** para sub-5; (B) como slice aparte si lo quieres.

## Confirmación, seguridad y no-regresión
- **Confirmación UI obligatoria** (mutación de plan): PlanDiff + Aplicar/Cancelar. Nada se escribe sin confirmar.
- **Motor manda:** las metas salen de `computeTargets`; la IA solo elige el coach que pidió la persona.
- **Topes de seguridad:** intactos (los enforce computeTargets). Guardrails médicos del persona intactos.
- Aditivo: no toca chat/foto/texto/generar_cena/cap/reembolso; no toca globals.css ni HOME.

## Archivos (plan)
- `lib/coach/actions.js`: `cambiarObjetivo({ ctx, input })` → merge + `computeTargets` → `{prev,next,perfil_merged}` (sin escribir). + tests.
- `app/api/coach/chat/route.js`: `CAMBIAR_PLAN_TOOL` + manejo en el loop → propuesta de plan.
- `app/coach/page.js`: render de la propuesta de plan (reusa `PlanDiff`) + [Aplicar] → `POST /api/profile` con `perfil_merged`.
