# Arquitectura del sistema de coaches especializados + cerebro

**Autor:** Karpathy AI-Nutri (AI Product Designer + Nutricionista Deportivo + Arquitecto)
**Para:** Lugia (mwao6a57) · Coordinación: Torvalds/CTO (gkmi48v7), Rams (skm3lj3d), Drucker (6rllfvd6)
**Base viva reconciliada:** `lib/nutrition/*` (motor determinista), `lib/coach/*` (persona/context/actions/allergens), `plan/coach-arquitectura.md`, `plan/coach-cerebro.md`, `plan/ola1-formulas-coaches.md`, `plan/rediseno-coach-ia.md`. **Fecha:** 2026-07-31

> **Regla de reconciliación:** NO duplicar ni romper lo vivo. El **motor** (`lib/nutrition/compute.js` → `computeTargets`) es la ÚNICA vía a kcal/macros; **la IA nunca inventa cifras**. Los coaches especializados son un **overlay de producto** (metadatos + preguntas + lógica de dominio) sobre los **5 coaches del motor** ya construidos (`lib/nutrition/coaches.js`: `perdida_grasa, hipertrofia, runner, recomposicion, bienestar`) y sobre el **cerebro** ya vivo (`lib/coach/persona.js`, `context.js`, `actions.js`, `allergens.js`). Los coaches médicos **no** llaman al motor para prescribir macros: son educativos y van gated.

---

## 1. REGISTRO de coaches

Separación limpia: **motor** (la matemática, `coaches.js`) ≠ **registro de producto** (metadatos + gating + overlay + onboarding). Propongo un archivo nuevo `lib/coach/registry.js` que **referencia** al coach del motor por `engine` y NO duplica sus números.

```js
// lib/coach/registry.js  (NUEVO, aditivo)
// engine: id de lib/nutrition/coaches.js que produce los macros (null = sin macros automáticos)
// gating: 'general' | 'medico'  ·  overlay: lógica de dominio determinista
export const COACH_REGISTRY = {
  perdida_grasa:  { engine:'perdida_grasa', gating:'general', ... },
  hipertrofia:    { engine:'hipertrofia',   gating:'general', ... },
  recomposicion:  { engine:'recomposicion', gating:'general', ... },
  runner:         { engine:'runner',        gating:'general', ... },
  bienestar:      { engine:'bienestar',     gating:'general', ... },
  vegano:         { engine:'<base>',        gating:'general', overlay:{ dieta:'vegano' } },
  keto:           { engine:'<base>',        gating:'general', overlay:{ dieta:'keto', macroSplit:'keto' } },
  cardiovascular: { engine:'<base>',        gating:'general', disclaimer:'soft', overlay:{ patron:'DASH' } },
  diabetes:       { engine:null,            gating:'medico', deferred:true, legal:true },
  hipertension:   { engine:null,            gating:'medico', deferred:true, legal:true },
  embarazo:       { engine:null,            gating:'medico', deferred:true, legal:true },
  infantil:       { engine:null,            gating:'medico', deferred:true, legal:true },
  adulto_mayor:   { engine:null,            gating:'medico', deferred:true, legal:true },
};
```

| id | Nombre | Icono (slug) | Especialidad | Gating | Motor | Estado |
|---|---|---|---|---|---|---|
| `perdida_grasa` | Pérdida de grasa | flame | Déficit sostenible + proteína | general | perdida_grasa | ✅ vivo |
| `hipertrofia` | Hipertrofia | dumbbell | Superávit + proteína alta | general | hipertrofia | ✅ vivo |
| `recomposicion` | Recomposición | refresh-cw | Grasa− y músculo+ a la vez | general | recomposicion | ✅ vivo (Ola 1, +1 sobre los 12) |
| `runner` | Runner | footprints | Rendimiento en carrera | general | runner | ✅ vivo |
| `bienestar` | Bienestar | leaf | Hábitos sostenibles | general | bienestar | ✅ vivo |
| `vegano` | Vegano | sprout | Proteína vegetal + micros | general | base+overlay | 🟡 fase B |
| `keto` | Keto / low-carb | egg | Split cetogénico | general | base+overlay | 🟡 fase B |
| `cardiovascular` | Salud cardiovascular | heart | Patrón cardiosaludable | general (precaución) | base+overlay | 🟡 fase B |
| `diabetes` | Diabetes (apoyo) | droplet | Educación IG, evitar picos | **médico** | — | 🔴 fase D, legal |
| `hipertension` | Hipertensión (apoyo) | activity | Educación sodio/DASH | **médico** | — | 🔴 fase D, legal |
| `embarazo` | Embarazo (apoyo) | baby | Info nutricional del embarazo | **médico/etapa** | — | 🔴 fase D, legal |
| `infantil` | Infantil (a padres) | child | Hábitos, sin dietas restrictivas | **médico/etapa** | — | 🔴 fase D, legal |
| `adulto_mayor` | Adulto mayor | user-round | Proteína/hidratación/sarcopenia | **médico/etapa** | — | 🔴 fase D, legal |

*(Los "12 del brief" = todos menos `recomposicion`, que es la 5ta del motor añadida en Ola 1. Total 13.)*
**Iconos = slugs para Rams** (elige el asset final); **jamás emojis en el texto del coach** (`coach-salida-formato.md`).

**Reconciliación de dietas (vegano/keto) vs eje de dieta:** una "coach de dieta" = **coach base del motor** (objetivo calórico: p. ej. mantener/recomp/pérdida) **+ overlay de dieta**. Se ofrecen como puerta de entrada por descubribilidad, pero internamente son `engine:<base> + overlay.dieta`. La dieta sigue siendo también un **eje/overlay** aplicable a cualquier coach (`rediseno-coach-ia.md` A1). **Keto requiere extender el motor**: `macros()` hoy usa grasa 0.8–1.0 g/kg; keto necesita split por % kcal (grasa 65–75%). → flag de cambio en `lib/nutrition/coaches.js`+`compute.js` (§3).

---

## 2. Onboarding por coach

**Común (ya existe en `nutrition_profiles`):** sexo, edad, altura, peso, actividad/PAL, [% grasa opc], tono. Lo **específico del coach** va en **`coach_params` (jsonb)** — que `compute.js` ya lee (runner: `km_semana`, `km_dia`, `min_por_km`, `quiere_bajar_grasa`). Cada coach declara su `onboarding[]` en el registro; el motor consume lo que necesita, el resto alimenta recomendaciones/eventos.

**Runner (ejemplo completo):**
| Pregunta | campo `coach_params` | Lo usa |
|---|---|---|
| km por semana | `km_semana` | **motor** (kcal entreno, carb mín por volumen) |
| días de entrenamiento | `dias_entreno` | eventos/plan |
| ritmo objetivo (min/km) | `ritmo_min_km` / `min_por_km` | motor (min entreno→hidratación) + timing |
| VO2máx (opcional) | `vo2max` | referencia de rendimiento (o estimar) |
| carrera: distancia + fecha + tipo | `carrera{distancia,fecha,tipo}` | carga/descarga, plan de carrera |
| elevación / superficie (asfalto/trail) | `superficie`, `elevacion` | gasto/recomendación |
| lesiones | `lesiones[]` | recuperación, deriva si aplica |
| FC reposo / máx | `fc_reposo`, `fc_max` | estimar VO2, zonas (informativo) |

**Otros coaches (resumen de `coach_params`):**
- **Hipertrofia:** `experiencia` (motor), `split`, `series_semana`, `dias_entreno`.
- **Pérdida de grasa:** `ritmo` {conservador|moderado} (motor), `peso_objetivo`.
- **Recomposición:** `grasa_pct` (motor, modula el déficit), `dias_entreno`.
- **Bienestar:** `foco_habito` {agua|verdura|menos_ultraprocesados|mantener}.
- **Vegano:** `fuentes_proteina[]`, `suplementos[]` (banderas B12/hierro/Ca/omega-3/D).
- **Keto:** `base_objetivo`, `tolerancia_carbos`, `sintomas_adaptacion`.
- **Cardiovascular:** `preocupacion` {colesterol|tension|general} (declarado, NO diagnóstico).
- **Médicos/etapa (§6):** onboarding **mínimo** + **consentimiento**; se captura solo contexto **declarado** por la persona (que ya conoce de su médico), nunca objetivos clínicos que fijemos nosotros.

---

## 3. Lógica nutricional por coach SOBRE el motor determinista

El **motor** (`computeTargets`) da: BMR (Mifflin/Katch), TDEE, `kcal_target`, `protein_g/carbs_g/fat_g`, `fiber_g`, `water_ml`, con **pisos y topes de seguridad** (déficit ≤1%/sem, piso `max(BMR·1.1, 1500H/1200M)`). El **overlay del coach** añade **recomendaciones deterministas** (tablas de `ola1-formulas-coaches.md`), que el modelo **solo redacta**:

| Coach | El motor da | El overlay añade (determinista; el modelo redacta) |
|---|---|---|
| **Runner** | kcal (base 1.35·BMR + 1 kcal·kg·km), macros, guardrail carbos por volumen | **timing** pre (1–4 g/kg)/durante (30–90 g/h)/post (0.3 prot+0.8–1.2 carb g/kg); **carga/descarga** (8–12 g/kg 48 h pre carrera; tapering −40/60% volumen); **hidratación** (500–750 ml/h) y **electrolitos** (Na 300–600 mg/h) |
| **Hipertrofia** | superávit por experiencia (tope de ganancia), prot 2.0, carbos amplios | timing de proteína, carbos peri-entreno, foco progresión |
| **Pérdida de grasa** | déficit 15–20% (tope 25% y ≤1%/sem, pisos), prot 2.0 | énfasis proteína/saciedad/fibra, nudges de adherencia |
| **Recomposición** | mantenimiento±deficit ligero (modulado por %grasa, tope 10%), prot 2.2 | paciencia/consistencia, proteína alta, fuerza |
| **Bienestar** | mantenimiento, macros guía | metas de hábito (agua/verdura/ultraprocesados/azúcar) |
| **Vegano** (overlay) | macros del coach base | fuentes de proteína vegetal, banderas de micros (B12/hierro/Ca/omega-3/D) |
| **Keto** (overlay) | **requiere split keto en el motor** (grasa 65–75% kcal) | electrolitos (gripe keto), carbos <20–50 g |
| **Cardiovascular** (overlay) | macros del coach base | patrón DASH/mediterráneo, +fibra soluble, vigilar Na/grasa sat. (educativo, disclaimer soft) |

**Regla:** el overlay **no recalcula kcal/macros** (eso es del motor); solo aporta *timing, splits declarativos y banderas*, todo desde tablas fijas. Excepción: **keto** sí toca el motor (split por %), por eso es una extensión de `coaches.js`/`compute.js`, no solo overlay.

---

## 4. Planes dinámicos — modelo de recálculo (determinista vs modelo)

Reusa `lib/coach/actions.js` (`cambiarObjetivo`, `estimar_comida`) y `plan/ola1-formulas-coaches.md` §5.

**DETERMINISTA (código, sin IA):**
- **Pendientes del día:** `pendientes = nutrition_targets − Σ meals(hoy)` (ya en `context.js`).
- **Presets de porción** (½/1/1½/2): reescalado lineal de macros. 0 IA.
- **Lista de súper:** diff de ingredientes del plan (quitar comida vieja, añadir nueva, consolidar duplicados, agrupar por categoría), respetando presupuesto/país.
- **Filtro de alérgenos:** `lib/coach/allergens.js` (`findViolations`) — **hermético, sobre-marca** — aplicado en los ejecutores de tools de comida (sugerencia y registro).
- **Cambio de objetivo:** `computeTargets` recalcula metas; se **propone** antes→después; se aplica solo al confirmar (`/api/profile`). Sin override manual de macros.
- **Recompute al cambiar UNA comida:** recomputar `pendientes`; **re-generar solo las comidas no consumidas** para cuadrar ±10%.

**EL MODELO SUGIERE (IA, validado):**
- **Qué** comida/receta concreta cierra los macros pendientes (creatividad culinaria, país/favoritos), vía `generar_cena`/`estimar_comida` → los **números salen del grounding/BD, no del chat**.
- Redacción y priorización (qué proponer primero).
- **Validación:** las cifras que el modelo muestre deben coincidir con el motor/tool; si difieren → se **sobreescriben con el motor** (regla viva en `actions.js`); si una comida trae números sin respaldo → `estimado` o se descarta (`coach-salida-formato.md` §4.2).

**Qué se actualiza al cambiar una comida:** (1) macros pendientes (determinista), (2) lista de súper (diff determinista), (3) recomendaciones/siguiente sugerencia (modelo, sobre los pendientes nuevos). Todo respetando el filtro de alérgenos.

---

## 5. Feedback diario — briefing matutino + resumen/score nocturno

Reusa el motor de eventos (`coach-arquitectura.md` §2) y la fusión AM (una sola llamada). Detección **determinista**, redacción IA.

**Briefing matutino (AM):** una llamada que empaqueta saludo + plan del día + consejo del día + pre-entreno si aplica.
- **Datos:** `pendientes` del día (o metas frescas), `proximo.entreno` (de `coach_params`/agenda), sueño/estrés si hay (`coach_day_state`), tono, coach. Overlay del coach → timing (runner: carbos pre; hipertrofia: proteína).
- **Salida:** tarjeta(s) `nutrition`/`workout` + `recommendation` + acción (ver plan/registrar).

**Resumen/score nocturno (PM):**
- **Score 0–100 (determinista):** combinación de adherencia a kcal (dentro de banda), cumplimiento de proteína, hidratación vs objetivo, y registro completo. Fórmula fija en código (0 IA); el modelo solo lo redacta.
- **Datos:** `Σ meals(hoy)` vs `nutrition_targets`, `coach_day_state.agua_ml`, racha (`streaks`/`daily_snapshots`).
- **Salida:** tarjeta `progress` (score + 1–2 métricas) + objetivo de mañana + racha. Fusionable con `weekly_review` los domingos.

Ambos usan `notification_log`/idempotencia y anti-spam por modo (`coach-arquitectura.md` §3).

---

## 6. ⚠️ Seguridad médica (crítico) — coaches médicos y de etapa

**Coaches gated (`gating:'medico'`, `deferred:true`, `legal:true`):** `diabetes, hipertension, embarazo, infantil, adulto_mayor`. `engine:null` → **NO llaman al motor para prescribir macros**.

**Qué SÍ:** apoyo **educativo y de organización** — informar en términos generales, organizar comidas dentro de límites que la persona/su médico ya conocen, registrar, visualizar (p. ej. mostrar sodio/IG), recordar hábitos. Reusa la regla viva en `lib/coach/persona.js` (BASE: "NO diagnosticas, NO prescribes, NO ajustas medicación… deriva").

**Qué NO debe hacer el coach (invariante, ningún tono lo relaja):**
- Diagnosticar o interpretar síntomas/estudios.
- Prescribir dietas terapéuticas o **macros automáticos**.
- Ajustar/indicar medicación o insulina.
- Fijar objetivos clínicos (glucosa, tensión, colesterol).
- Contradecir a su profesional sanitario o desalentar la consulta.

**Gating (implementación):**
1. **Feature-flag** por coach médico (`registry.deferred`) → **fuera del MVP** hasta revisión legal+clínica.
2. **Consentimiento informado** explícito y registrado (fecha) al elegir un coach médico/etapa.
3. **Banner de disclaimer** persistente + **disclaimer reincidente** en cada respuesta que toque la condición.
4. **Guardrail de salida** dedicado sobre las respuestas de estos coaches (además del system): bloquea prescripción/ajuste de tratamiento/objetivos clínicos.
5. **Datos de salud = sensibles** (LFPDPPP MX/GDPR): RLS, minimizar, cifrar, retención acotada (ya es el modelo del repo).

**Disclaimer (texto base):** *"Esta app no es un dispositivo médico ni sustituye a tu profesional de salud. Con [condición], consulta siempre a tu médico antes de cambiar tu alimentación. En una emergencia, acude a un servicio de salud."*

**Necesita revisión LEGAL + CLÍNICA antes de exponer (marcar como bloqueante):**
- T&C, consentimiento informado y política de datos de salud (abogado).
- Fórmulas, umbrales y copys de cada condición (nutriólogo/médico colegiado).
- Clasificación de riesgo por condición: **máxima cautela → sin macros automáticos** para diabetes T1, embarazo, infantil, renal (ver `rediseno-coach-ia.md` §7.3); adulto mayor e hipertensión, alta cautela educativa.
- Confirmación de si alguna condición debe **excluirse por completo** del producto (p. ej. T1 en menores).

---

## 7. Plan de construcción por fases (accionable)

| Fase | Qué | Reusa / toca | Estado |
|---|---|---|---|
| **A (vivo)** | 5 coaches del motor + cerebro Fase 1 (chat reactivo, tool-use, tonos, alérgenos) | `lib/nutrition/*`, `lib/coach/*` | ✅ hecho |
| **B — coaches generales de dieta** | `registry.js` + `vegano`/`cardiovascular` (overlay: fuentes/banderas/patrón) + `keto` (**extiende el motor**: split por %) + onboarding `coach_params` de cada uno | +`lib/coach/registry.js`, +split keto en `coaches.js`/`compute.js` | 🟡 |
| **C — overlays de dominio + feedback** | tablas de timing/carga runner y micros vegano surfaced por el coach; briefing AM + score PM (deterministas) sobre el motor de eventos | `coach-arquitectura.md` §2, tablas `ola1-formulas` | 🟡 |
| **D — coaches médicos/etapa** | `diabetes/hipertension/embarazo/infantil/adulto_mayor` educativos + gating + consentimiento + guardrail de salida | tras **revisión legal+clínica** (bloqueante) | 🔴 |

**Orden recomendado:** A (hecho) → B (dieta, amplía mercado sin riesgo) → C (feedback diario, retención) → D (médicos, solo tras legal/clínica).

---

## Coordinación
- **CTO (gkmi48v7):** `lib/coach/registry.js` (aditivo, no toca `coaches.js` salvo el split keto); consumir `coach_params` en onboarding; overlays deterministas de dominio; score PM/briefing AM sobre el motor de eventos; feature-flags de coaches médicos; guardrail de salida. Mantener: la IA nunca inventa cifras; alérgenos en código.
- **Rams (skm3lj3d):** selector de coach (13 tarjetas con icono/nombre/especialidad, médicos marcados y gated), onboarding por coach (sets de `coach_params`), consentimiento + disclaimers visibles para médicos, tarjetas del briefing AM/score PM.
- **Drucker (6rllfvd6):** qué coaches en cada fase, si dieta (keto/vegano) es coach de entrada o toggle, y qué médicos difieren; gating por tier.

**TL;DR:** el motor determinista y el cerebro ya vivos se **extienden**, no se reescriben: un **registro de producto** añade los coaches especializados como metadatos + `coach_params` + overlays deterministas sobre los 5 coaches del motor; las dietas son overlay (keto toca el motor por el split); los coaches médicos son **educativos, gated y diferidos** hasta revisión legal+clínica. Cero cifras inventadas, alérgenos en código, pisos de seguridad intactos.
