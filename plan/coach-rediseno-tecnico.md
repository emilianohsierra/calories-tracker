# Mi Coach — Rediseño técnico (diseño para revisión)

**Autor:** Torvalds (CTO) · **Para:** Lugia (Director)
**Estado:** DISEÑO. **Sin código.** 🔶 = pido tu VB.
**Base:** código actual (`app/coach/page.js`, `app/api/coach/*`, `lib/coach/*`), sistema de diseño de Ola 1 (`app/globals.css`).
**Specs pendientes:** `plan/coach-salida-formato.md` (Karpathy) y `plan/coach-ui-rediseno.md` (Rams) **no están en el repo todavía**. La arquitectura de abajo es **data-driven y spec-agnóstica**: los triggers de tarjeta y los valores visuales exactos se enchufan cuando lleguen, sin rehacer nada.

## Regla #20 de Emiliano (NO NEGOCIABLE): no romper nada
El rediseño es **solo capa de PRESENTACIÓN**. Se conserva el 100% de la lógica y de Supabase actuales:
- `app/coach/page.js` mantiene: carga de historial (`GET /api/coach/history`), envío (`POST /api/coach/chat`), gate Free/Pro (402 → `UpgradeModal`), personalidad (`PersonalityPicker` + `/api/coach/settings`), saludo contextual (`/api/coach/context`), manejo de error (blindaje → `data.error`/`data.text`).
- `/api/coach/*`, `lib/coach/*`, el cap `ai_usage`, el reembolso: **intactos**.
- **Único punto de cambio funcional:** donde hoy la burbuja del coach pinta `m.content` (texto crudo) → se envuelve en `<MessageRenderer content={m.content} />`. Todo lo demás es aditivo (componentes nuevos + estilos + theming).
- **Orden que pediste:** presentación/UX primero → dark mode después → probar todo al final.

---

## (1) RENDERER DE MENSAJES — nunca Markdown crudo

**Problema actual:** el coach (Haiku) devuelve texto que puede traer `##`, `**`, `---`, `|`, tablas; hoy se pinta crudo en la burbuja. Hay que convertirlo en **componentes estilizados** y detectar **datos → tarjetas**.

**Componente nuevo `components/coach/MessageRenderer.js`** con 2 fases:
1. **Detección de datos → tarjetas (antes del markdown).** Un helper `lib/coach/parseMessage.js` reconoce bloques estructurados y los extrae como tarjetas (§2), dejando el resto como prosa. Fuentes de estructura (según el formato de Karpathy cuando llegue):
   - **Preferido:** que el coach emita un **envelope ligero** — p.ej. un bloque cercado ```json {tipo:'nutrition', ...} ``` o marcadores `<card:meal>…</card>` — que parseamos 100% determinista → tarjeta. **Cero ambigüedad, cero alucinación de números** (la regla de Karpathy: la IA no inventa cifras; las tarjetas se llenan con datos del motor/BD, no del texto libre).
   - **Fallback heurístico** mientras no haya envelope: detectar patrones (líneas tipo `Calorías: 620 · Proteína: 40 g`) → `NutritionCard`. Conservador (si no matchea, va como prosa) para no romper.
2. **Prosa → componentes con Markdown SEGURO.** El texto restante pasa por Markdown con **mapeo de componentes** para que **nunca** aparezca sintaxis cruda.

### Librería vs parser propio — Recomendación: **react-markdown + rehype-sanitize**
| Opción | A favor | En contra |
|---|---|---|
| **react-markdown + rehype-sanitize** ✅ | Seguro por defecto (sanitiza HTML → sin XSS); mapeo `components={{h1,h2,strong,ul,li,table,hr,code,a}}` a nuestros estilos; maneja todos los casos (tablas, listas, énfasis) sin reinventar | +~40–60 KB al bundle del chat; hay que estilar cada elemento |
| Parser propio (regex) | Cero dependencia, bundle mínimo | Frágil (casos borde de MD), riesgo de XSS si se descuida, mantenimiento nuestro |

**Recomiendo react-markdown + rehype-sanitize**: la seguridad (sanitización) y la cobertura no son negociables en contenido generado por IA, y el mapeo de `components` garantiza que `##`/`**`/`|` **siempre** se rendericen estilizados (título, negrita, tabla-tarjeta), nunca crudos. El peso extra vive solo en la ruta `/coach` (code-split). 🔶 **VB-R1.**

> Si Karpathy define un **envelope estructurado** (JSON/tags) para las tarjetas, la prosa restante suele ser corta → react-markdown se justifica igual por seguridad, y la mayoría del valor visual viene de las tarjetas deterministas.

---

## (2) COMPONENTES DE TARJETA (reusando datos existentes)

`components/coach/cards/*` — cada una **data-driven** (recibe props tipados), reusa lo de Ola 1, respeta el spec de Rams cuando llegue:

| Tarjeta | Qué muestra | Reusa |
|---|---|---|
| **NutritionCard** | kcal + macros (anillo + mini-anillos) | **`ProgressRing`** y la lógica de `DayProgress` (Ola 1); targets de `/api/coach/context` o `nutrition_targets` |
| **MealCard** | platillo sugerido: título, kcal/macros, "Registrar" | patrón de `components/MealList.js`; acción → reusa `/api/meals` POST (registro manual gratis) |
| **RecommendationCard** | consejo accionable + micro-CTA | tono/persona actuales |
| **ProgressCard** | tendencia (racha, adherencia, Δ peso) | `daily_snapshots`/derivado |
| **WorkoutCard** | timing pre/post entreno | `coach_params` del perfil |

**Principio (Karpathy):** las tarjetas se llenan con **números del motor/BD** (targets, meals), no con cifras parseadas del texto libre. La MealCard "Registrar" reusa el guardado existente de `meals` → cero lógica nueva de datos. 🔶 **VB-R2:** ¿las tarjetas accionan vía el envelope del coach (tool-like) o solo presentan? (Recomiendo: presentan + acciones que reusan endpoints ya existentes; las acciones IA reales = Rebanada de tool-use, aparte.)

---

## (3) DARK MODE — theming reusable en TODA la app

**Buenas noticias:** `app/globals.css` **ya tiene** los tokens `[data-theme="dark"]` (del sistema de Rams, Ola 1). Falta el **toggle + persistencia + sin-flash**; hoy no hay switch ni auto-dark (se dejó a propósito para no romper).

**Diseño (reusable app-wide, no solo coach):**
- **Fuente de verdad:** atributo `data-theme` en `<html>` = `light` | `dark`. Modo del usuario = `claro` | `oscuro` | `sistema` (default **sistema**), guardado en `localStorage('theme')`.
- **Sin flash (crítico):** un **script inline pequeño en `app/layout.js`** (antes de pintar) lee `localStorage` y `matchMedia('(prefers-color-scheme: dark)')` y fija `data-theme` en el `<html>` **antes** del primer render. Sin esto se ve un parpadeo claro→oscuro.
- **Toggle `components/ThemeToggle.js`** (Claro/Sistema/Oscuro): actualiza `localStorage` + `data-theme`; en modo "sistema" escucha cambios de `prefers-color-scheme` en vivo.
- **Hex de Emiliano:** cuando los dé, se actualizan los valores de `[data-theme="dark"]` (y light si quiere) en `globals.css`. Los componentes ya usan `var(--…)`, así que **cambian solos**, sin tocar JSX.
- **Reusable:** el toggle + script sirven para toda la app (HOME, perfil, onboarding), no solo `/coach`. Recomiendo ubicar el toggle en Perfil (y opcional en el header del coach).

🔶 **VB-R3:** ¿toggle global en Perfil (recomendado) y/o un botón en el header del coach? ¿Emiliano ya tiene los hex del dark, o uso los tokens actuales de Rams como base?

---

## (4) ESTADOS DE CARGA / ERROR elegantes
- **Escribiendo:** `components/coach/TypingIndicator.js` (3 puntos con fade, no spinner) en burbuja del coach mientras se espera la respuesta (reemplaza el `…` actual).
- **Skeleton de tarjeta:** shimmer con la forma de la tarjeta si tarda.
- **Error (ya blindado):** el server siempre manda JSON `{error}`; la burbuja lo muestra. Se re-viste como **burbuja de error** discreta + acción "Reintentar" (re-envía el último mensaje). El diagnóstico técnico se mantiene detrás en beta.
- **Vacío (primer uso):** saludo contextual del coach (ya existe) + quick-actions.
- **Respeta `prefers-reduced-motion`** (fades desactivados).

---

## (5) PLAN POR REBANADAS (orden de Emiliano: presentación → dark → probar)

| Rebanada | Qué | Ítems del checklist de Emiliano que valida |
|---|---|---|
| **R1 — MessageRenderer** | `MessageRenderer` + `parseMessage`; la burbuja del coach deja de pintar crudo. Aditivo, no toca lógica. | **render markdown** (nunca `##`/`**`/`\|` crudos) |
| **R2 — Tarjetas** | `NutritionCard`/`MealCard`/`RecommendationCard`/`ProgressCard`/`WorkoutCard` + detección de datos; reusa `ProgressRing`/`meals`/`targets` | **cards** |
| **R3 — Shell del chat** | pulir header, burbujas, compositor, quick-actions, scroll, responsive (spec Rams) | **chat · scroll · input · quick-actions · responsive** |
| **R4 — Dark mode** | tokens (ya existen) + toggle Claro/Sistema/Oscuro + persistencia + sin-flash (reusable app) | **Light · Dark · persistencia** |
| **R5 — Estados** | TypingIndicator + skeleton + burbuja de error/reintentar + vacío | **carga · errores** |
| **R6 — Prueba integral** | pasada completa con el checklist de Emiliano en móvil/desktop, Light+Dark, chat real | TODOS |

**Regla de corte:** cada rebanada compila (build verde), es reversible y **no rompe** el chat vivo (la lógica de datos no se toca). Nada a producción sin tu revisión; QA de Nielsen antes del deploy porque toca la superficie más visible.

---

## Archivos (aditivos salvo el punto de integración)
**Nuevos:** `components/coach/MessageRenderer.js`, `lib/coach/parseMessage.js`, `components/coach/cards/*.js`, `components/coach/TypingIndicator.js`, `components/ThemeToggle.js`, (posible) `components/coach/ChatBubble.js`.
**Modificados (presentación):** `app/coach/page.js` (swap `m.content` → `<MessageRenderer>`, montar TypingIndicator/estados; **toda la lógica de fetch/gate/tono se conserva**), `app/layout.js` (script no-flash + montar ThemeToggle donde toque), `app/globals.css` (estilos de tarjetas + prosa; dark tokens ya existen).
**Dep nueva (si VB-R1):** `react-markdown` + `rehype-sanitize` (code-split en `/coach`).

## Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Romper el chat vivo | El rediseño es solo presentación; la lógica de datos/Supabase no se toca (regla #20). Renderer envuelve, no reemplaza. |
| XSS en contenido IA | `rehype-sanitize` (o allowlist estricta en parser propio) |
| Flash de tema | Script inline en `layout.js` antes de pintar |
| Bundle del chat | react-markdown solo en `/coach` (code-split); tarjetas ligeras |
| IA inventa cifras en tarjetas | Tarjetas se llenan con datos del motor/BD (targets/meals), no del texto libre (regla de Karpathy) |
| Specs (Karpathy/Rams) llegan después | Arquitectura data-driven: envelope de salida y tokens visuales se enchufan sin rehacer |

## Puntos que necesitan tu VB
- **VB-R1:** react-markdown + rehype-sanitize (recomendado) vs parser propio.
- **VB-R2:** tarjetas presentan + acciones que reusan endpoints existentes (vs acciones IA/tool-use, que serían rebanada aparte).
- **VB-R3:** ubicación del toggle (Perfil global recomendado) + ¿hex de dark de Emiliano o base actual de Rams?
- **Transversal:** confirmo que espero `coach-salida-formato.md` (Karpathy) y `coach-ui-rediseno.md` (Rams) para fijar triggers de tarjeta y valores visuales exactos; la arquitectura no depende de ellos para arrancar R1.
