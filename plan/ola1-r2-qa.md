# QA focalizado — Ola 1 · Rebanada 2 (onboarding + HOME conversacional)

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Alcance (rápido, no exhaustivo):** revisión por código + `vitest` en vivo. Releídos:
`supabase/ola1.sql`, `app/api/profile/route.js`, `lib/nutrition/{compute,formulas,coaches}.js`,
`app/onboarding/page.js`, `app/page.js` (HOME), `components/{DayProgress,ProgressRing}.js`,
`package.json`. Tests: **12/12 pasan** (`npx vitest run`).

---

## VEREDICTO: ✅ LISTO-PARA-DEPLOY-BETA

No encontré bloqueantes ni regresiones. La rebanada es **aditiva, no-destructiva y con gate
suave correcto**. Quedan 2 detalles MENORES de UX (backlog, no frenan la beta).

---

## (1) NO-REGRESIÓN — ✅ CONFIRMADO

- **Gate suave correcto.** `app/page.js:184,213` — `profile && targets ? DayProgress/CoachTipCard :
  DailySummary/CTA`. Un usuario vivo **sin perfil** conserva el `DailySummary` de siempre y ve una
  tarjeta suave "Crear mi plan"; **no se le redirige ni se le expulsa.** El onboarding es opt-in por
  botón.
- **Tolerante a que `ola1.sql` no esté corrido.** `app/page.js:86-94` hace `fetch('/api/profile')`
  con `.then(r => r.ok ? r.json() : null)` y `.catch`. El GET (`app/api/profile/route.js:23-28`)
  ignora el error de `maybeSingle` y devuelve `{profile:null,targets:null}` con 200 aunque la tabla
  no exista → HOME cae a `DailySummary`. **Ningún usuario existente se rompe pre-SQL.**
- **Rutas vivas intactas.** analyze / meals / summary / settings / usage / Stripe(paywall) / login:
  `app/page.js` solo **añade** el fetch de perfil y render condicional; no cambia sus llamadas.
  `WeekChart` usa `targets?.kcal_target || goal` (fallback seguro).
- **Login/middleware:** `/onboarding` es página → protegida por el middleware existente (redirige a
  `/login` sin sesión); `/api/profile` valida `getUser()` → 401. Sin cambios al gate de sesión.

## (2) ONBOARDING happy-path — ✅ OK

6 pasos (`app/onboarding/page.js`): intro → objetivo(coach) → datos(sexo/edad/altura/peso/PAL) →
afinar(coach-params) → "calculando" → **revelación del plan**. El POST a `/api/profile` guarda
perfil + calcula targets con el motor DETERMINISTA (`computeTargets`) y la revelación muestra
**kcal, proteína, carbos, grasa, fibra y agua** (`page.js:212-222`). Solo se envían los
`coach_params` del coach elegido (`:43-46`). Correcto.

## (3) CASOS BORDE — ✅ sin fallos duros

- **Clamp de PAL / NaN:** el PAL sale de un `<select>` de 5 valores discretos (1.2–1.9), default
  1.375; `computeTargets` lo pasa por `clampPal` (`compute.js:6-10`, `Number.isFinite` → default
  1.55). **Imposible NaN.** Verificado también por los 12 tests del motor.
- **Navegación atrás:** "Atrás" (`page.js:233`) decrementa el paso **preservando** el estado; al
  cambiar de coach, `submit` filtra los `coach_params` relevantes → sin arrastre de datos ajenos.
- **Inputs raros:** edad/altura/peso son `Number(...)` en submit; valores vacíos bloquean
  `canNext` (paso 3); valores fuera de rango los rechaza el server (`route.js:52-77` → 400 "Datos
  inválidos: …") y además los CHECK de la BD. `Math.round` normaliza decimales.
- **Onboarding incompleto:** `canNext` exige coach (paso 2) y edad+altura+peso (paso 3) antes de
  avanzar; doble-clic en "Ver mi plan" protegido por `disabled={busy}`.
- **Guardrails del motor sin crash:** `carbMinByKm` (`coaches.js:31-35`) tiene entrada `{km:0}` →
  `.find` siempre matchea (nunca `undefined.gkg`); pisos por sexo y de déficit aplicados.
- **DayProgress/ProgressRing:** `safeGoal = goal>0?goal:1`, `pct` clampeado, `|| 0`/`|| 1` en cada
  divisor → **sin divide-by-zero ni NaN** aunque un target llegara 0.

## (4) NO DESTRUCTIVO — ✅ CONFIRMADO

- `supabase/ola1.sql`: solo `create table if not exists` de **2 tablas nuevas**
  (`nutrition_profiles`, `nutrition_targets`), RLS por `auth.uid()` (patrón idéntico a `meals`),
  y `drop policy if exists` **solo** sobre las políticas de esas tablas nuevas. **No toca**
  meals/settings/subscriptions/usage_counters/app_config/storage. Idempotente.
- `package.json`: diff puramente aditivo (script `test` + `vitest` en devDependencies).

---

## Issues MENORES (backlog, no bloquean la beta)

- **I1 (UX):** un dato inválido del paso 3 (p.ej. edad=5) no se avisa en el paso 3; pasa el gate
  `canNext` y solo revienta al hacer submit en el **paso 4** con "Datos inválidos: edad" → el
  usuario debe volver Atrás a corregir. Sugerencia: validar rango en el paso 3 antes de avanzar.
- **I2 (cosmético/raro):** si existiera perfil pero `targets=null` (inserción parcial previa),
  HOME muestra otra vez la CTA "Crear mi plan". Re-hacer el onboarding hace `upsert` y lo corrige;
  probabilidad baja.

---

## Nota de despliegue
El flujo end-to-end del perfil **requiere correr `supabase/ola1.sql`** antes de la beta (si no, el
onboarding falla con error suave "No se pudo guardar tu perfil", pero el HOME de usuarios existentes
sigue funcionando). Recomiendo correrlo como paso previo al deploy de la beta.
