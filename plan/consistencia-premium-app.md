# Consistencia Premium + Dark Mode — Auditoría y Plan (fuera del Coach)

**Autor:** Jigglypuff Casey (`n8qg7eil`) · Product / UX-UI
**Para:** Director Lugia (`mwao6a57`) · **Pre-revisión:** Rams Design (`skm3lj3d`) — **APROBADO**
**Fecha:** 2026-07-31 · **Estado:** CERRADO — listo para priorización de sprint (Lugia)
**Lane:** consistencia visual + dark mode en **HOME (`app/page.js`), onboarding (`app/onboarding/page.js`), perfil (`app/perfil/page.js`), registro de comida (`components/AddMealModal.js`)** y los componentes compartidos que usan. El sistema base y el coach son de Rams.

**Fuentes de verdad (según Rams):**
- Implementación viva: tokens del bloque *"Ola 1 · Sistema de diseño (Rams)"* en `app/globals.css` (≈líneas 716-751) + dark `[data-theme="dark"]` (≈827-843) y `@media (prefers-color-scheme:dark)` (≈844-862).
- Racional/spec: `plan/ola1-spec-diseno.md` §1 y `plan/rediseno-sistema-diseno.md`. Dark canónico = `plan/coach-ui-rediseno.md` §8.
- Regla de dark: mi auditoría **consume** el `[data-theme="dark"]` + `@media` de Rams; **no** defino paleta paralela ni otro `[data-theme]`.

---

## 0. Diagnóstico en una frase

La app tenía **dos identidades visuales conviviendo**: el sistema **teal canónico** (coach, onboarding, perfil, DayProgress) y un **sistema legacy azul** pre-rebrand (`--accent #2a78d6`, hex hardcodeados y emojis) que aún manda en HOME, registro, MealList y login. Dos síntomas medibles: (1) marca azul en modo claro en los CTA primarios; (2) dark roto en superficies con hex hardcodeado. Ambos son **alto impacto / bajo riesgo**: no tocan lógica, auth, IA ni datos.

---

## 0.1 Estado del SISTEMA (ya aterrizado por Rams — verificado en `app/globals.css`)

Rams cerró la capa de sistema; mi trabajo restante es **migración por pantalla** que consume esto:

- **Azul legacy unificado a teal** — alias en el bloque Ola1 `:root`: `--accent: var(--brand)` (`:733`), `--accent-strong: var(--brand-strong)`, `--accent-track: var(--brand-tint)`. Como estas declaraciones van **después** del `:root` viejo, ganan en cascada → `.btn-primary/.spinner/.usage-badge/.link-btn/.field:focus` salen **teal en claro** sin tocar clase por clase.
- **`--surface` = `#FFFFFF`** canónico (`:720`, antes heredaba legacy `#fcfcfb`).
- **`--warn`** agregado como alias de `--warn-c` (`:736`); citar `--warn`.
- **`.c-title` = 17/24** (`:885`, el spec manda).
- **Set de íconos canónico** en `components/ui/Icon.js` (línea 1.5px, 24×24, `currentColor`). API: `<Icon name="camera" size={20} />`; decorativo = `aria-hidden`, accesible = pasar `title`. Mapa emoji→icono al final del archivo.
- **Paleta dark de `ola1-spec §1` marcada SUPERSEDED**; la canónica (`coach-ui §8`, hex de Emiliano) vive en `globals.css`. Mi auditoría consume la de `globals`.

Pendiente único de sistema para mi P0: **tokens de track de nutriente** (`--protein-track/--carbs-track/--fat-track/--fiber-track`, claro+dark). Rams los aprobó y los añade esta iteración → D5 migrará a **token**, no a hex. Inter (`next/font`) queda como **dependencia de sistema de Rams** para el sprint (alto impacto transversal, no es mi lane).

---

## 1. QUÉ SE VE VIEJO / INCONSISTENTE (vs. el sistema)

### 1.1 Color de marca azul en modo claro — RESUELTO a nivel sistema
Estaba en `.btn-primary` (`app/globals.css:385` → `var(--accent)`), afectando CTA de HOME/onboarding/perfil/registro. Con el alias `--accent → --brand` en el `:root` Ola1, **ya sale teal en claro**. → mi P0.2 pasa a **verificación visual**, sin markup.

### 1.2 Emojis como UI (rompe la regla "cero emojis como UI")
El coach quedó libre de emojis; mis pantallas siguen llenas:
- `app/page.js`: 🍽️ (banner, 151), 🤖/⭐ (usage-badge, 165-166), 💬 (entrada al coach, 187), 📷 (FAB, 255), 🖼️ (galería, 264), 🚀 (copy del toast, 98).
- `components/AddMealModal.js`: ✍️ "A mano" (145), ✨ "Analizar con IA" (148), 🔁 "Reanalizar" (252).
- `app/perfil/page.js`: ✔ "Plan actualizado" (131). · `app/onboarding/page.js`: 🎉 "Tu plan está listo" (233).
- También: `components/MealList.js` (🍽️ placeholder + 🗑 borrar), `app/login/page.js` (🍽️), `components/UpgradeModal.js`.

→ Migración a `<Icon>` según el mapa de `components/ui/Icon.js`: 🍽️→utensils · 📷→camera · 🖼️→image · ✍️→pencil · ✨→sparkles · 🔁→refresh · 🗑→trash · ✔/🎉→check · 💬→message · 🤖/⭐→star · 🚀→sparkles.

### 1.3 HOME no usa el saludo conversacional del sistema
`app/page.js` usa el `.banner` legacy con emoji, mientras existe `.greeting/.greeting-title/.greeting-sub` (`app/globals.css:762`) y `components/GreetingHeader.js` **construido pero huérfano**. Sustituir el banner por el saludo elimina el encabezado viejo + emoji y sube el "feel". (Copy del saludo: coordinar con Drucker.)

### 1.4 Roles tipográficos no aplicados
HOME/registro usan tamaños ad-hoc (`.banner-title` 21/700, `.hero-value` 48/600, `.section-title` 15/700, `.stat-value` 20/600) en vez de los roles canónicos (`.c-title` 17/24, `.c-subtitle`, `.c-body`, `.c-eyebrow` + escala §1.2). Onboarding/perfil ya usan `.wizard-title/.wizard-help`.

### 1.5 Cifras sin `.num` (regla: números siempre tabulares)
Faltan en `DailySummary` (hero kcal + tiles) y `MealList` (kcal por platillo): `.hero-value`, `.stat-value`, `.meal-kcal`. DayProgress/onboarding/perfil ya lo usan.

### 1.6 Targets táctiles < 44px (regla `--touch:44px`)
`.nav-btn` 34×34 (`:120`, navegación de día), `.icon-btn` padding 4px (`:353`, borrar de MealList), `.link-btn`/`.goal-edit-btn` (área inline).

### 1.7 Focus ring inconsistente
`:focus-visible` global correcto (`:755`, `--ring-focus`), pero `.field input:focus` (`:643`) lo pisa con `outline` propio. Quitar el override para usar el ring canónico.

---

## 2. QUÉ SE ROMPE EN DARK (al aplicar el `[data-theme="dark"]` de Rams) — MÍO (P0)

Hex hardcodeados que no pasan por token y se quedan en su valor claro en oscuro:

| # | Lugar | Problema en dark | Fix (a token) | Se usa en |
|---|---|---|---|---|
| D1 | `.banner` `:47` | gradiente `#e9f1fb,#f5f9fd` + border azul → queda azul pálido con texto claro | `--surface-2`/`--brand-tint` + `--border` | HOME, login |
| D2 | `.toast` `:666` | `background:#eef5ff` + border azul, texto `--ink` → fondo claro + texto claro ilegible | `--brand-tint` + `--border` + `--text` | HOME, perfil |
| D3 | `.chart-tooltip` `:254` | `background:var(--ink); color:#fff` → en dark `--ink`≈claro + texto blanco = **invisible** | invertir: bg `--text`, texto `--bg`/`--surface` | WeekChart (HOME) |
| D4 | `.error-banner` `:576` | texto `#7c1d1d` sobre `--critical-track` translúcido → **falla AA** en dark | `--over` / `--over-tint` | HOME, onboarding, perfil, registro |
| D5 | `DayProgress.js:20-22` | tracks `#F6D9CF/#FBEAC9/#D8DCFB` → claros/estridentes sobre oscuro | `--protein-track/--carbs-track/--fat-track` (Rams los agrega) | HOME (macros) |
| D6 | `.usage-badge` `:596` | border `rgba(42,120,214,.18)` azul fijo | `--border` / `--brand-tint` | HOME |
| D7 | `.banner-icon` `:80`, `.banner::before` `:60` | bordes/relleno azules fijos | tokens de marca | HOME, login |
| D8 | `WeekChart` (verificar) | barras/labels con `--accent` e `--ink`; ya teal por alias, confirmar en dark | consumir tokens | HOME |

> `.modal-overlay` y sombras `rgba(11,11,11,…)` funcionan en ambos temas (tokenizar `--overlay` es opcional, no urgente).

---

## 3. PLAN PRIORIZADO (implementación por pantalla — mi lane)

Todo es CSS/markup de presentación; cero lógica, auth, IA o datos.

### P0 — Corrección (dark roto + off-brand + des-emojificar). Máxima visibilidad, mínimo riesgo.
1. **D1-D8: migrar los hex hardcodeados a token** para que el dark de Rams los cubra (D5 espera los track tokens de Rams).
2. **Marca teal en claro** — ✅ resuelto a nivel sistema; solo **verificación visual** por pantalla.
3. **Des-emojificar HOME y registro** con `<Icon>` (mapa de `components/ui/Icon.js`) en banner, FABs, usage-badge y botones de AddMealModal.

### P1 — Consistencia premium
4. **HOME: reemplazar `.banner` por el saludo conversacional** (`GreetingHeader`/`.greeting`) — elimina D1/D7 y varios emojis.
5. **Roles tipográficos canónicos** (`.c-*` + escala §1.2) en HOME y registro.
6. **`.num`** en `DailySummary` y `MealList`.
7. **Montar `<ThemeToggle/>` en perfil** (Apariencia) — hoy el toggle **solo** vive en el coach (`app/coach/page.js:185`); quien no abre el coach no puede cambiar de tema. Uso el componente existente de Rams.
8. **Targets ≥44px** en `.nav-btn`, `.icon-btn`, `.link-btn`.
9. **Quitar el override de focus** en `.field input:focus`.

### P2 — Pulido más profundo (requiere producto + Rams)
10. **Estados vacíos / skeleton / carga fuera del coach** — coordinar con Drucker (copy) y Rams (`EmptyState`/`Skeleton`).
11. **UpgradeModal premium** (hoy tabla HTML plana) — solapa con monetización (Drucker/Lugia).
12. **Migrar `app/login/page.js`** (pantalla más vieja).
13. **Rollout del `<Icon>`** a MealList/UpgradeModal/login.

---

## 4. Por pantalla (resumen)

- **HOME `app/page.js`** — la más inconsistente. P0: D1/D2/D3/D5/D6/D7 + des-emojificar (7 emojis) + verificar teal. P1: saludo conversacional, roles tipográficos, `.num`.
- **Registro `components/AddMealModal.js`** — bottom-sheet bueno. P0: D4 + `<Icon>` en ✍️/✨/🔁 + verificar `.spinner`/CTA teal. (Nota: mejora de producto pendiente *auto-analizar al capturar* en `plan/ux-rediseno.md`; fuera de mi scope, solo referencia.)
- **Perfil `app/perfil/page.js`** — casi en sistema. P0: D2 (toast) + D4 (error-banner). P1: montar ThemeToggle, ✔→`<Icon check>`.
- **Onboarding `app/onboarding/page.js`** — el más sano. P0: D4. P1: 🎉→`<Icon check>`.

---

## 5. Capa de sistema (Rams) — RESUELTA

1. **Azul legacy** → ✅ alias `--accent/--accent-strong/--accent-track → --brand*` en `:root` Ola1. (Se prefirió el aliasing por apalancamiento.)
2. **Set de íconos** → ✅ `components/ui/Icon.js` (24 íconos + mapa emoji→icono). Reutilizo, no invento; si falta uno, lo pido a Rams.
3. **Tracks de nutriente** → ✅ aprobado; Rams añade `--protein-track/--carbs-track/--fat-track/--fiber-track` (claro+dark) esta iteración (confirmado por mí). D5 migra a token.

## 6. Discrepancias spec ↔ implementación — RECONCILIADAS (una sola verdad)

- **Paleta dark:** canónica = `coach-ui §8` (en `globals.css`); el bloque dark de `ola1-spec §1` quedó **SUPERSEDED** (marcado por Rams). ✅
- **`--surface` claro:** fijado a `#FFFFFF` en el bloque Ola1. ✅
- **`--warn`:** alias de `--warn-c` (ambos vivos); citar `--warn`. ✅
- **`.c-title`:** subido a 17/24 (spec manda). ✅
- **Inter no cargado:** dependencia de **sistema (Rams)** para el sprint (`next/font` en `app/layout.js`); no es mi lane. ⏳

---

## 7. Criterio de aceptación (claro y oscuro, por pantalla)

Cero azul legacy visible · cero emojis como UI · todo interactivo ≥44px · `:focus-visible` canónico · cifras con `.num` · color de nutriente idéntico en toda la app · `prefers-reduced-motion` respetado · contraste AA (normal ≥4.5:1, grande ≥3:1) verificado en dark en D1-D8. Pendiente no bloqueante (Nielsen QA): **pasada visual real** en móvil/tablet/desktop en ambos temas — Rams revisará el resultado en dark.

---

*Siguiente paso:* plan **CERRADO** y aprobado por Rams; el sistema base ya está listo. Va a **Lugia** para priorizar el sprint y dar el go de implementación. Al recibir el go arranco por **P0** (D1-D8 → token, verificar teal, des-emojificar HOME/registro). No codifico hasta el go de Lugia.
