# QA de NO-REGRESIÓN — Consistencia premium (HOME + registro + perfil + onboarding)

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Doc:** `plan/consistencia-premium-app.md`. Revisión por código + `vitest` (**32/32 pasan**).
Diff: `app/{page,onboarding/page,perfil/page}.js`, `components/{AddMealModal,DailySummary,DayProgress,GreetingHeader,MealList}.js`, `app/globals.css`, `components/ui/Icon.js` (nuevo).

---

## VEREDICTO: ✅ LISTO-PARA-DEPLOY

Cambio **100% de presentación**: emoji→`<Icon>`, hex hardcodeado→token, azul legacy→teal (alias),
`ThemeToggle` montado en perfil, prop opcional `actions` en `GreetingHeader`. **Ningún** handler,
fetch, validación o estado cambió. Coach/auth/IA/datos intactos. Sin issues bloqueantes.

---

## (1) FUNCIONALIDAD intacta en las 4 pantallas — ✅

Verifiqué que los diffs **no tocan lógica** (los `onClick`/`fetch`/`useState`/submit son idénticos;
solo se reformatearon o se les añadió `style` inline-flex para alinear el ícono):

- **HOME (`app/page.js`):** el badge conserva su expresión (`plan==='free' && remaining<=3 ? ' low'`)
  y su `onClick={setShowPlans}`; **Salir** sigue con `onLogout`; el FAB sigue con
  `cameraInputRef.current?.click()`. Solo 🍽️/🤖/⭐/📷/🖼️ → `<Icon>`.
- **Onboarding (`app/onboarding/page.js`):** ÚNICO cambio = "listo 🎉" → `<Icon check>`. El submit
  (paso 4 → `POST /api/profile` → `computeTargets` → revelación) **sin tocar**. Sigue enviando y
  calculando.
- **Perfil (`app/perfil/page.js`):** `save()` (`POST /api/profile`), form y `PlanDiff` **sin tocar**;
  toast "Plan actualizado ✔" → `<Icon check>`; y se **montó `<ThemeToggle/>`** bajo "Apariencia"
  (mismo componente ya verificado: Claro/Sistema/Oscuro, persiste en localStorage, default Sistema).
- **Registro (`components/AddMealModal.js`):** ✍️/✨/🔁 → `<Icon>`; `onClose/enterManual/
  onAnalyzeClick/reanalyze` idénticos; `runAnalysis`/`save`/gate del paywall **sin tocar** →
  analizar/registrar/paywall siguen igual.

## (2) DARK MODE en las 4 pantallas + componentes compartidos — ✅ (estructural)

- **hex→token:** `DayProgress` (tracks `#F6D9CF…`→`var(--*-track)`), `DailySummary`
  (`--accent/--warning/--critical`→`--brand/--warn-c/--over`), `MealList` (`--critical`→`--over`).
- **Compartidos:** `toast`=`--brand-tint`, `error-banner`=`--over-tint`, `usage-badge`,
  tracks/tints = tokens. El bloque `[data-theme="dark"]` **y** `@media (prefers-color-scheme: dark)`
  redefinen `--surface/--text/--border/--brand*/--over*/--warn*` **y** los alias legacy
  (`--accent/--warning/--critical` + `-track`) → todo fluye a dark vía tokens.
- **Sin flash:** `app/layout.js` **no se modificó** → el script anti-flash sigue intacto.
- **Hex correctos:** teal `#0E7C6B` (claro) / `#2BC4AC` (oscuro), consistentes en tokens.
- *Caveat honesto:* verifiqué la estructura de tokens, no pixeles reales → recomiendo un vistazo
  visual rápido en las 4 pantallas en Light/Dark.

## (3) CERO emojis crudos como UI — ✅

Barrido Unicode en las 8 pantallas/comps: **0 emoji** en JSX (los únicos `→` son en comentarios
de código, no UI). `Icon.js` cubre los 12 nombres usados (camera/check/close/image/info/message/
pencil/refresh/sparkles/star/trash/utensils) y degrada seguro (`if (!d) return null`) → un nombre
inexistente no rompe.

## (4) TEAL consistente (sin azul legacy en claro) — ✅

`--brand` = teal; `--accent: var(--brand)` **sobrescribe** el legacy `#2a78d6` (queda muerto). El
único consumidor de `--accent` que no se editó (`WeekChart.js`, gráfica de HOME) queda **teal**
automáticamente en ambos modos. Los tonos azulados que quedan (`--fat`, `--water`) son colores
**semánticos de macros/agua**, por diseño, no "azul de marca".

## (5) NO se tocó lógica/auth/IA/datos ni el coach — ✅

La lista de archivos modificados son solo las 8 pantallas/comps + `globals.css` + 3 docs. **No** hay
cambios en `app/api/*` (analyze/meals/profile/coach/stripe/usage), `middleware.js`, `lib/supabase/*`,
`lib/analyze.js`, `lib/coach/*`, `app/coach/*`, ni en los `.sql`. El coach es release aparte y no se
tocó. Auth/IA/datos intactos.

---

## 🟡 Nit (cosmético, no bloquea)

- **N1:** `GreetingHeader` ganó una prop opcional `actions` que ninguna de las 4 pantallas usa aún
  (HOME mantiene su `banner` propio). Aditivo y backward-compatible; sin efecto. Solo lo anoto.

---

## Resumen para el Director
| Check | Estado |
|---|---|
| 1 · HOME (render/Salir/badge), onboarding (envía/calcula), perfil (edita/guarda + ThemeToggle), registro (analiza/registra/paywall) | ✅ intactos |
| 2 · Dark en 4 pantallas + toast/error-banner/badge/tracks, sin flash, hex correctos | ✅ (estructural; vistazo visual recomendado) |
| 3 · Cero emojis crudos (todo `<Icon>`) | ✅ |
| 4 · Teal consistente, sin azul legacy en claro | ✅ |
| 5 · No se tocó lógica/auth/IA/datos/coach | ✅ |

**LISTO-PARA-DEPLOY.** Único pendiente recomendado (no bloqueante): una pasada visual en las 4
pantallas en Light y Dark. No toqué producción.
