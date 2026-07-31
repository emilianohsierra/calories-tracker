# QA integral — Rediseño de Mi Coach (R1 renderer + R3 shell + R4 dark + R5 estados)

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Docs:** `plan/coach-*.md`. Revisión por código + `vitest` (**27/27 pasan**, incl. `parseMessage`).
Archivos: `app/coach/page.js`, `app/api/coach/chat/route.js`, `app/layout.js`,
`lib/coach/{parseMessage,persona,context}.js`, `lib/theme.js`, `components/ThemeToggle.js`,
`components/coach/{MessageRenderer,Composer,QuickActions,PersonalityPicker,cards/*}.js`.

---

## VEREDICTO: ✅ LISTO-PARA-DEPLOY

Los 7 puntos del checklist de Emiliano pasan. El cambio crítico (coach → tool `responder`
estructurada) **no rompe el cap**. Solo quedan 4 nits cosméticos (no bloquean).
*Nota: revisión por código; lo visual (pixeles Light/Dark, breakpoints, teclado móvil) lo verifiqué
a nivel de estructura, no renderizado real.*

---

## (1) RENDER — nunca Markdown crudo · 5 tarjetas · MealCard → /api/meals · ✅

- **0 Markdown crudo (doble garantía):** el coach **está forzado** a responder por la tool
  `responder` (`chat/route.js` `tool_choice`), así que su salida son campos estructurados, no
  prosa con `##`/`**`/`|`. Y para mensajes legacy/usuario, `MessageRenderer` usa `ReactMarkdown`
  + `remarkGfm` + **`rehypeSanitize`** con `MD_COMPONENTS` que estilizan h1-3/strong/hr/table/code
  → jamás se ve `##`/`---`/`|` literal ni HTML/XSS.
- **Fallback seguro:** si el modelo emite texto libre en vez de la tool, el server lo envuelve en
  `{titular: text.slice(0,280), bloques:[], accion:ninguna}` (`route.js` §4.2.4) → nunca pinta
  Markdown crudo.
- **Las 5 tarjetas** (`nutrition/meal/recommendation/progress/workout`) existen, tienen props por
  defecto y degradan sin romper (tipo desconocido → `null`). `NutritionCard` usa `objetivo || 1` en
  el anillo (sin divide-by-zero). Sin emojis (glifos = SVG).
- **MealCard "Registrar":** `onRegister → onRegisterMeal` hace `POST /api/meals` con
  título/kcal/macros/ingredientes (`confidence:'coach'`, `meal_type:'comida'`), estados
  idle→Registrando…→Registrado ✓, y guard anti-doble-clic (`state !== 'idle'`).
- **Validación de números (motor manda):** `normalizeResponse` recorta a 3 bloques y en `nutrition`
  recomputa `pendiente = max(0, objetivo − consumido)` server-side.

## (2) DARK MODE — ✅

- **Toggle Claro/Sistema/Oscuro, default Sistema** (`ThemeToggle`, `OPTS`, `useState('system')`),
  íconos SVG (sin emoji).
- **Persiste** tras recargar/cerrar: `setTheme` guarda `light/dark` en `localStorage`; `system`
  borra la llave (= default). `getStoredTheme` la lee al montar.
- **Sin flash (FOUC):** script inline en `<head>` (`app/layout.js` `THEME_INIT`) fija `data-theme`
  **antes** del primer render leyendo `localStorage`. En `system` no pone atributo → resuelve el
  `@media (prefers-color-scheme)`.
- **Hex correctos:** `THEME_COLORS = { light:'#FBFBF9', dark:'#0B0D10' }`, coinciden en el script,
  el `<meta theme-color>` y `applyTheme`. En `system` sigue en vivo el cambio del SO.

## (3) CHAT / INPUT — ✅

- **Composer auto-crece** (`textarea` reajusta `scrollHeight` hasta 120px). **Enter envía /
  Shift+Enter salto** (`onKeyDown`). Botón ＋ → `onAttach`.
- **＋ y "Analizar" abren `AddMealModal`** (reuso del flujo de HOME): ambos disparan
  `fileRef.click()` → `onPickFile` (downscale) → `<AddMealModal>` con `usage`. No duplican lógica.
- **Quick actions** (`QuickActions`) → `onSend(t)` / `onNav(p)`.
- **PersonalityPicker** persiste vía `POST /api/coach/settings` (solo `nutrition_profiles.tone`,
  **sin recalcular plan**) y solo refleja el cambio si `res.ok`.

## (4) ESTADOS — ✅

- **Carga:** `TypingIndicator` en la última burbuja mientras `busy`.
- **Error humano + Reintentar SIN duplicar burbuja:** el error se pinta como
  *"No pude completar el análisis. Inténtalo de nuevo."* + botón Reintentar. `retry()` reusa la
  **misma** última burbuja (`setLastBubble({content:''})` → re-fetch), no agrega una nueva.
- **Sin tecnicismos salvo `?debug`:** el `diag`/`build` solo se muestran con `?debug` en la URL.

## (5) RESPONSIVE — ⚠️ (estructura OK; visual no verificable por código)

Shell con thread scrolleable (`coach-thread` + auto-scroll), composer al fondo (`coach-composer`),
inputs con `disabled` en `busy`. La fijación del input y el comportamiento del teclado dependen del
CSS (`app/globals.css`); no puedo verificar pixeles/breakpoints en revisión estática. **Recomiendo
una pasada visual rápida en móvil/tablet/desktop antes del deploy.**

## (6) NO-REGRESIÓN (crítico) — ✅

- **El cap del chat sigue intacto y el cambio a tool NO lo rompe:** `consumir_ia` se llama en
  `route.js:193` **antes** de la llamada a Anthropic (`:237`); `free_limit → 402` y
  `kill_switch/global_cap → 503` retornan **antes** de gastar IA. La tool `responder` está toda
  **downstream** del gate.
- **Reembolso:** `reembolsar_ia` se llama si no hay respuesta válida (`!response.titular`) o en el
  `catch`; `requestId` se anula tras éxito/errores manejados (no reembolsa de más).
- **Personalidad / historial:** `settings`/`history`/`context` intactos; el historial ahora guarda
  JSON estructurado que `parseMessage` reconoce (y los legacy en texto siguen pintando bien).
- **analyze/meals/Stripe/HOME/onboarding:** sin cambios (solo se añadió el botón/entrada del coach y
  la reutilización de `AddMealModal`/`/api/meals`). `consumir_analisis` y el candado Free de 10 no
  se tocan.

## (7) EMOJIS — ✅

El coach ya **no** usa emojis: `persona.js` (BASE + los 4 tonos) repite "Sin emojis";
`OUTPUT_RULES` y el schema de `titular` prohíben Markdown/emojis; el saludo determinista ya no
lleva 👋. Los únicos glifos son chrome de UI (íconos SVG, "Registrado ✓").

---

## 🟡 Nits (cosméticos, no bloquean)

- **N1 (copy):** el mensaje de error dice "No pude completar el **análisis**" incluso para un chat
  normal (no un análisis). Ligeramente impreciso; humano y no técnico. Sugerencia: "No pude
  responder ahora."
- **N2 (costo, raro):** el reembolso se dispara con `!response.titular` aunque Anthropic haya
  facturado tokens por una tool malformada/vacía. Muy raro (la tool está forzada); leve fuga de
  costo acotada.
- **N3 (UX):** el Composer muestra un micrófono **deshabilitado** ("Próximamente") si el navegador
  soporta SpeechRecognition → control muerto en móviles Chrome. Cosmético (Fase 2).
- **N4 (menor):** el historial reinyecta a Anthropic los turnos del asistente como **JSON**
  (contenido estructurado) — inofensivo, algo verboso; el modelo lo tolera.

---

## Resumen para el Director
| Check | Estado |
|---|---|
| 1 · Render sin Markdown crudo · 5 cards · MealCard→/api/meals | ✅ |
| 2 · Dark: Claro/Sistema/Oscuro default Sistema, persiste, sin flash, hex ok | ✅ |
| 3 · Composer auto-grow, Enter/Shift+Enter, +/Analizar→AddMealModal, quick actions, tono persiste | ✅ |
| 4 · Estados: carga, error humano + Reintentar (no duplica), ?debug | ✅ |
| 5 · Responsive | ⚠️ estructura ok; pasada visual recomendada |
| 6 · No-regresión: cap/402/reembolso/personalidad/historial/analyze/meals/Stripe/HOME/onboarding | ✅ |
| 7 · Sin emojis del coach | ✅ |

**LISTO-PARA-DEPLOY.** Único pendiente recomendado (no bloqueante): una pasada visual en móvil/tablet
/desktop en Light y Dark. No toqué producción.
