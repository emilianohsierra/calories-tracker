# Ola 1 — Plan de implementación (LEAD: Torvalds/CTO)

**Repo:** calories-tracker · **Base:** `plan/rediseno-arquitectura-tecnica.md`, `plan/premium-vision-nutricion-ia.md` (fórmulas §2), `plan/rediseno-coach-ia.md` (coaches §2).
**CRÍTICO:** la app está VIVA y cobra (Stripe). **Nada rompe producción** (`analyze`, `meals`, Stripe). Todo aditivo. Build local verde. **Nada a producción sin revisión del Director.**
**Nota de fuentes:** `plan/ola1-formulas-coaches.md` (Karpathy) y `plan/ola1-spec-diseno.md` (Rams) aún no están en el repo. El **motor es data-driven** (parámetros de coach en config), así que si esos docs llegan con números distintos, **se ajusta la config, no el código**. La Rebanada 1 (backend) no depende del spec visual.

## Alcance Ola 1
Onboarding por objetivos · plan calculado · HOME conversacional · macros dinámicos · reporte semanal · Consejo del día · rachas · paywall (reusa Stripe).
**Coaches de arranque (no-médicos):** `perdida_grasa`, `hipertrofia`, `runner`, `bienestar`.

---

## Principio de diseño: DETERMINISTA en código vs IA
- **Determinista (código, 0 costo, testeable con asserts):** BMR/TDEE/objetivo energético/macros/agua, reparto por comida, rachas, ajuste adaptativo de macros (media móvil peso vs ritmo). Es matemática de `premium-vision-nutricion-ia.md §2`.
- **IA (Haiku, capeado, con perfil cacheado):** registro por texto, reporte semanal, Consejo del día + plan del día (generación fusionada AM). Todo se apoya en los números **ya calculados** por el motor determinista (grounding).

---

## Cambios de esquema (Supabase, aditivos e idempotentes; los corre Emiliano tras tu revisión)
| Tabla (nueva) | Para | Notas |
|---|---|---|
| `nutrition_profiles` | Onboarding: objetivo(s), coach, sexo, edad, altura, peso, peso meta, PAL, entrenos, patrón dietético, intolerancias[], **alergias[]**, país, presupuesto, tiempo de cocina, **tono** (personalidad), consentimiento, flags | 1 fila/usuario. RLS CRUD propio. Datos del usuario. |
| `nutrition_targets` | Plan calculado: BMR, TDEE, kcal_objetivo, proteína/carbos/grasa/fibra/agua, método, `computed_at` | 1 fila/usuario (recomputable). RLS select propio; escribe el backend. |
| `streaks` | Racha de registro (current, longest, last_date, día de gracia) | Determinista. RLS. |
| `daily_insights` | Consejo del día + plan del día + reporte (payload IA) por fecha/slot | UNIQUE(user_id,date,slot) idempotente. |

Ninguna toca `meals`, `settings`, `subscriptions`, `usage_counters`, `app_config`.

---

## Secuencia por REBANADAS (independientes, testeables, no rompen lo vivo)

### 🍰 Rebanada 1 — Fundación *(DETERMINISTA, 0 IA)* ← se entrega ahora
Esquema `nutrition_profiles` + `nutrition_targets`; **motor de cálculo determinista** (`lib/nutrition/*`); **backend de onboarding** (`/api/profile` GET/POST que valida, calcula y persiste). *Test: POST perfil → devuelve targets correctos (asserts vs ejemplos A/B/C de Karpathy).* Sin UI, sin IA, sin tocar rutas vivas.

### 🍰 Rebanada 2 — Onboarding UI *(0 IA)*
Pantallas por objetivo (spec Rams) → escriben `/api/profile`; muestran el plan calculado (anillos/targets). Gate: si no hay perfil, HOME invita a onboarding. *Test: flujo alta usuario → ve su plan.*

### 🍰 Rebanada 3 — Rachas *(DETERMINISTA, 0 IA)*
`streaks` + lógica al guardar comida (incrementa/gracia 1 día) + badge en HOME. *Test: registrar días consecutivos/saltados.*

### 🍰 Rebanada 4 — Registro por texto *(IA mínima, capeada)*
`/api/log-text`: 1 llamada Haiku parsea "2 tacos de pastor" → items+macros (grounding), reutiliza el guardado de `meals`. Cuenta en el ledger `ai_usage` (Free limitado). *Test: frase → comida guardada.*

### 🍰 Rebanada 5 — Reporte semanal *(IA, Pro)*
Job semanal (Vercel Cron) → 1 Haiku sobre snapshots → `daily_insights(slot='weekly')` + UI. Pro-gated con el patrón de cuota existente. *Test: forzar cron → reporte.*

### 🍰 Rebanada 6 — Consejo del día + plan del día + HOME conversacional *(IA, generación fusionada AM)*
Job AM (Cron + timezone bucketing) → **1 sola llamada Haiku** genera `{plan_dia, consejo_dia}` → `daily_insights(slot='am')` → **1 push**. UI: HOME conversacional presenta el plan; el **Consejo del Día** es una **tarjeta hero compartible** (mismo contenido, presentación distinta — VB-A5). *Test: forzar cron AM → tarjeta + plan.*

### 🍰 Rebanada 7 — Macros dinámicos *(DETERMINISTA; explicación opcional IA)*
Motor adaptativo (`premium-vision-nutricion-ia.md §4`): media móvil 7d de peso vs ritmo objetivo → ±5–10% kcal, máx 1 ajuste/ciclo, con topes de seguridad; recomputa `nutrition_targets`. *Test: series de peso → ajuste esperado.*

### 🍰 Paywall (transversal)
Reusa el Stripe/`usage` ya en producción: el **coaching/insights/registro-texto** cae bajo el ledger `ai_usage` por-feature (Free degustación, Pro generoso). No se reimplementa cobro.

**Orden recomendado:** R1 → R2 → R3 → (R4 ∥ R5) → R6 → R7. Cada una lanzable y reversible.

---

## Rutas nuevas / modificadas (Ola 1 completa)
- **Nuevas:** `POST/GET /api/profile` (R1), `POST /api/log-text` (R4), `POST /api/cron/weekly` (R5), `POST /api/cron/daily-am` (R6), `POST /api/targets/recompute` (R7).
- **Modificadas (aditivo):** al guardar en `meals` se dispara actualización de racha (R3) y snapshot diario; `app/page.js` HOME muestra plan/tarjeta/racha (R2/R3/R6). **`analyze`/`meals`/Stripe no cambian su contrato.**

## Componentes (UI, olas 2/6 con spec de Rams)
Onboarding wizard, tarjeta de plan/anillos de macros, badge de racha, tarjeta hero de Consejo del Día (compartible), vista de reporte semanal, HOME conversacional.

---

## Rebanada 1 — entregable de este reporte
- `supabase/ola1.sql` — `nutrition_profiles` + `nutrition_targets` (idempotente, aditivo).
- `lib/nutrition/formulas.js` · `coaches.js` · `compute.js` — motor determinista puro.
- `app/api/profile/route.js` — GET/POST con `getUser` 401, validación, cálculo y persistencia.
- Build verde; sin tocar `analyze`/`meals`/Stripe.
