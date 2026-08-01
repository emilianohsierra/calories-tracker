# HOME como Briefing Diario + Navegación Coach — Spec buildable

**Rol:** UX/UI Lead + Senior Mobile Designer · **Autor:** Rams Design (skm3lj3d) · **Fecha:** 2026-07-31
**Reconcilia con el sistema VIVO** (no inventa otro): tokens de `app/globals.css` (bloque Ola 1 + `[data-theme=dark]`), `components/ui/Icon.js`, y los componentes actuales `GreetingHeader`, `ProgressRing`, `DayProgress`, `CoachTipCard`, `MealList`.
**Norte (Jony Ive):** coach sereno tipo Oura — tranquilidad, no saturación; acompañamiento, no contabilidad.
**Regla:** NO construir aún (Lugia secuencia). Este doc es el spec; cada pieza mapea a archivo real.

**Firmas vivas que reuso (verificadas en código):**
- `GreetingHeader({ name, subtitle, actions })` → `.greeting/.greeting-title/.greeting-sub`.
- `ProgressRing({ value, goal, size, stroke, color, track, children, label })` → SVG, anima `stroke-dashoffset` con `--dur-ring`/`--ease-spring`.
- `DayProgress({ totals, targets })` → anillo kcal + 3 mini-anillos de macro (usa `--protein/carbs/fat` + `--*-track`).
- `Icon({ name, size })` → set canónico (message, sparkles, star, activity, droplet, flame, trending, check, close, camera…).
- Tokens: `--brand #0E7C6B`/dark `#2BC4AC`, `--brand-ink`, `--surface`, `--surface-2`, `--text/-2/-3`, `--protein/carbs/fat/fiber/water` + `--*-track`, `--ok/--warn-c/--over`, `--s1..s10`, `--r-*`, sombras, `--overlay`, `.num`.

---

## 1. HOME = BRIEFING DIARIO del coach

**Idea rectora:** al abrir, HOME no es un tablero de cifras: es **el parte del día que te da tu coach**. Lenguaje humano arriba, datos como soporte. Una pantalla, mucho aire, un protagonista (el briefing).

### 1.1 Orden vertical (móvil, scroll)
```
┌─ GreetingHeader ────────────────────────────────┐  [REAL, extender]
│  Buenos días, Emiliano                [Pro ·⚙]  │
│  Tu coach ya analizó tu día                      │  ← subtitle = línea de estado del coach
├─ BriefingCard (el corazón) ─────────────────────┤  [NUEVO, compone lo de abajo]
│  ┌ hoy entrenas ─────────────────────────────┐  │
│  │ (activity) Fuerza · tren superior · 18:00 │  │  [IA/INPUT] plan del día
│  └───────────────────────────────────────────┘  │
│  Anillo kcal (hero, DayProgress) + restante      │  [REAL]
│  ── Macros objetivo (barras premium) ──          │
│  Proteína  ▓▓▓▓▓▓▓░░  118 / 150 g               │  [REAL] MacroBar
│  Carbos    ▓▓▓▓▓░░░░  140 / 220 g               │
│  Grasa     ▓▓▓▓▓▓░░░   48 / 70 g                │
│  ┌ CoachLine (1 línea conversacional) ────────┐ │  [IA]
│  │ (orbe) "Hoy vas excelente. Si cenas         │ │
│  │  proteína, llegas a tu objetivo."           │ │
│  └───────────────────────────────────────────┘ │
├─ QuickActions (chips) ──────────────────────────┤  [REAL .chip-action]
│  [Registrar] [Pregúntale al coach] [Ver plan]   │
├─ MealTimeline (comidas de hoy) ─────────────────┤  [REAL MealList]
└─ (FAB Registrar + TabBar con orbe Coach) ───────┘
```

**Tranquilidad, no saturación:** el kcal-ring es el único elemento grande; las barras de macro son finas y calmadas; una sola línea del coach (nunca un párrafo). Nada de rojos de alarma: estado `over` usa `--over` con copy amable ("mañana es otro día"). Peso/medidas, micros y tendencias **no** viven en HOME — van al Dashboard (§3).

### 1.2 Piezas nuevas y extensiones

**(a) GreetingHeader — extender (no romper).** Ya recibe `subtitle`. Pasar como subtitle la **línea de estado del coach**: `"Tu coach ya analizó tu día"` (cuando hay briefing listo) · `"Analizando tu día…"` (loading) · `"Empecemos: registra tu primera comida"` (vacío). Cero cambios de API; solo el valor. Datos: `[IA→Karpathy]`, fallback `[REAL]` "Tu resumen de hoy".

**(b) BriefingCard — NUEVO** `components/home/BriefingCard.js`. Contenedor `.briefing-card` (usa `.card`/tokens) que compone: TrainingRow + DayProgress (anillo) + MacroBars + CoachLine. Es "una sola tarjeta serena" en lugar de 4 bloques sueltos → menos saturación.

**(c) TrainingRow — NUEVO** `components/home/TrainingRow.js`. Píldora con `Icon name="activity"` + tipo de entreno + hora. `props:{ title, when }`. `[IA/INPUT]`; si no hay entreno hoy → "Descanso hoy" o se oculta. Estilo `.training-row` (chip `--surface-2`, `--r-md`).

**(d) MacroBar — NUEVO (reutilizable, clave del brief)** `components/ui/MacroBar.js`.
```
props: { label, value, goal, color, track }   // color/track = tokens de nutriente
```
- Barra premium: pista `background: var(--track)`, relleno `background: var(--color)`, `height:8px`, `border-radius: var(--r-pill)`, relleno anima `width` con `--dur-ring`/`--ease-spring`. A la derecha, `value / goal g` en `.num`.
- Reusa los tokens ya vivos `--protein/--protein-track`, etc. → consistencia cromática automática con los anillos de `DayProgress`.
- Sobre-objetivo: si `value>goal`, la barra llega a 100% y muestra un tope sutil (no rojo). `aria`: `role="progressbar" aria-valuenow/min/max aria-label`.
- **Decisión de reconciliación:** en HOME, los macros se muestran como **barras** (petición del brief: "barras de progreso premium"); el **anillo kcal se mantiene como héroe** (Oura). Los 3 mini-anillos de `DayProgress` se sustituyen por 3 `MacroBar` dentro de la BriefingCard (más legibles y calmados en fila). `DayProgress` sigue exponiendo el anillo kcal; propongo `DayProgress` con prop `macroStyle: 'bars'|'rings'` (default `bars` en HOME) para no romper otros usos.

**(e) CoachLine — NUEVO** `components/home/CoachLine.js`. UNA línea conversacional del coach, anclada a datos. `props:{ text, onAsk }`. Estilo `.coach-line`: `Icon` orbe (o `CoachOrb`) + texto `.c-body` en `--text`, fondo `--brand-tint` sutil, `--r-md`. Tap → abre el Coach con esa línea de contexto (`onAsk`). `[IA→Karpathy]`; fallback determinista desde macros pendientes ("Te faltan 32 g de proteína; una cena con pollo o frijol lo cierra."). **Nunca** más de una línea en HOME.

**(f) QuickActions / MealTimeline / FAB / CoachTipCard:** reutilizar lo vivo (`.chip-action`, `MealList`, FAB, `CoachTipCard`). El `coach-entry` actual ("Habla con Mi Coach") se **absorbe** en la navegación permanente (§2) para no duplicar accesos.

### 1.3 Datos que consume HOME (contrato Karpathy)
| Elemento | Fuente | Estado |
|---|---|---|
| kcal/macros del día vs objetivo | `/api/meals` + `/api/profile`(targets) | `[REAL]` |
| línea de estado ("ya analizó tu día") | coach/insight | `[IA]` fallback estático |
| entreno de hoy | perfil/plan | `[IA/INPUT]` |
| CoachLine conversacional | coach (macros pendientes) | `[IA]` fallback determinista |
| comidas de hoy | `/api/meals` | `[REAL]` |

---

## 2. NAVEGACIÓN con botón PERMANENTE "Coach IA"

**Objetivo:** el Coach siempre a un toque, y que se sienta **ChatGPT** (conversación viva), no un chatbot de menús. Reconcilia con el `coach-entry` actual y la ruta `/coach` ya viva.

### 2.1 TabBar inferior — `components/TabBar.js` (NUEVO)
```
┌──────────┬──────────┬────────┬──────────┬──────────┐
│  Inicio  │ Progreso │  (◎)   │  Plan    │  Perfil  │
│  (home)  │ (trending)│ Coach │ (utensils)│ (avatar)│
└──────────┴──────────┴────────┴──────────┴──────────┘
                        ▲ orbe permanente, elevado -12px
```
- 4 tabs de igual peso + **orbe Coach central elevado**. Fijo abajo, `background: var(--surface)`, `border-top:1px var(--border)`, safe-area (`env(safe-area-inset-bottom)`).
- Ítem: `Icon` 24 + label `.c-eyebrow`/12px. Activo `--brand`, inactivo `--text-3`, `aria-current="page"`, target ≥44px, `role="tablist"`.
- **Orbe Coach** = `CoachOrb` (SVG, gradiente `--brand`→`--brand-strong`, sin cara/robot), botón 56px elevado, `--shadow-3`. Reposo: "respiración" `scale(1↔1.03)` 4s (off con `reduced-motion`). Abre `/coach` (hoja/ruta). `aria-label="Abrir tu coach"`.
- Reemplaza el `coach-entry` de HOME → un solo acceso permanente, sin duplicar.

### 2.2 "Se siente ChatGPT" (referencia al spec de coach)
El detalle del chat ya está en `plan/coach-ui-rediseno.md` (burbujas, streaming token a token, puntos que respiran, tarjetas accionables, sin markdown crudo, RichMessage). Aquí solo la **puerta**: el orbe. Al abrir, saludo contextual + composer premium (no botones de menú). La coherencia de conversación la garantiza ese spec; este briefing enlaza a él.

### 2.3 Interino (si el TabBar se difiere en el build)
Si Lugia secuencia el TabBar después: mantener un **orbe flotante persistente** (FAB Coach) inferior-derecha en todas las pantallas, mismo `CoachOrb`, para no perder el "permanente". Es un fallback, no el destino.

---

## 3. DASHBOARD premium — dirección (layout + jerarquía)

Pantalla "Progreso" (tab). Responde **"¿cómo voy en el tiempo?"** — separado de HOME ("¿cómo voy hoy?") para no saturar ninguno. Orden por prioridad; cada widget es una `.card`, un dato protagonista, mucho aire. Máx 1 gráfica visible por scroll-fold.

```
1  Predicción de objetivo (hero del dashboard)      [IA]  ← "A este ritmo, tu meta ~ 12 nov (−4.2 kg)"
   barra hacia la meta + ETA. Sereno, motivador.
2  Adherencia semanal (anillo %)                    [REAL derivable]
3  Tendencia de peso (línea, media móvil 7d)         [INPUT]  Karpathy §2.2
4  Proteína semanal (barras 7 días vs objetivo)      [REAL]  reusa WeekChart
5  Hidratación (hoy + semana)                        [INPUT] tap +1 vaso
6  Tendencia de kcal (semana/mes, toggle)            [REAL 7d]/[V2 mes]
7  (V2) Micronutrientes relevantes                   [?Karpathy]
```
- **Jerarquía:** la **predicción de objetivo** es el héroe (es lo más "coach": proyecta, no solo reporta). Adherencia y peso arriba; hidratación/kcal debajo. Micros a V2.
- **Widgets reutilizables:** `ProgressRing` (adherencia), `WeekChart` (proteína/kcal/tendencias — ya vivo, SVG), `MacroBar` (barras), `PredictionCard` (NUEVO: barra a meta + ETA + 1 línea del coach), `TrendLine` (NUEVO: línea con media móvil), `StatCard`/`MetricTile` (NUEVO ligero).
- **Sin sobrecarga:** cada card es independiente y colapsable; toggle semana/mes en un `segmented` (ya existe `.segmented`). Estados vacíos accionables (ver §6). Widgets Pro (predicción, micros, histórico) con teaser `LockedOverlay` + `UpgradeModal` (vivo).
- **Dato→fuente** etiquetado como en §1.3; los `[?]`/`[V2]` se muestran como estado-vacío-accionable hasta que el endpoint exista.

> Este spec entrega **dirección y jerarquía** del dashboard (lo pedido), no cada píxel; el detalle fino se especifica cuando Lugia lo priorice y Karpathy confirme predicción/tendencias.

---

## 4. Librería de componentes (nuevos vs reusados)

| Componente | Archivo | Estado |
|---|---|---|
| GreetingHeader (línea de estado del coach) | `components/GreetingHeader.js` | **Extender** (solo valor de `subtitle`) |
| BriefingCard | `components/home/BriefingCard.js` | **Nuevo** (compone) |
| TrainingRow | `components/home/TrainingRow.js` | **Nuevo** |
| MacroBar | `components/ui/MacroBar.js` | **Nuevo** (reutilizable, tokens de nutriente) |
| CoachLine | `components/home/CoachLine.js` | **Nuevo** |
| DayProgress (`macroStyle: bars\|rings`) | `components/DayProgress.js` | **Extender** |
| ProgressRing / WeekChart | `components/ProgressRing.js`, `components/WeekChart.js` | **Reusar** |
| QuickActions / MealTimeline / CoachTipCard | `.chip-action`, `MealList.js`, `CoachTipCard.js` | **Reusar** |
| TabBar + CoachOrb | `components/TabBar.js`, `components/coach/CoachOrb.js` | **Nuevo** |
| PredictionCard / TrendLine / MetricTile | `components/dashboard/*` | **Nuevo** (dirección §3) |
| LockedOverlay / UpgradeModal | `components/UpgradeModal.js` (+ overlay) | **Reusar** |

Clases CSS nuevas (a `globals.css`, usando tokens): `.briefing-card`, `.training-row`, `.macro-bar`/`.macro-bar__track`/`.macro-bar__fill`, `.coach-line`, `.tabbar`/`.tab`/`.coach-orb`, `.pred-card`. Ninguna define color propio: todo por token.

---

## 5. Microinteracciones, animaciones, feedback

- **Anillo kcal y MacroBars:** al cargar/registrar, se llenan de 0→valor con `--dur-ring`/`--ease-spring` (el anillo ya lo hace; MacroBar anima `width`). Es el feedback de "avancé".
- **Registro guardado:** toast "Guardado" (vivo) + anillo/barras suben + `Icon` check; háptico sutil (PWA `navigator.vibrate`, si existe).
- **CoachLine / orbe:** el orbe "respira" (scale sutil, 4s). La línea del coach entra con fade+translateY(6px).
- **TabBar:** cambio de tab con crossfade 120ms; orbe al pulsar `scale .96`.
- **Todo respeta `prefers-reduced-motion`** (ya hay regla global; MacroBar y orbe deben honrarla → sin animación, estado final directo).

---

## 6. Estados: loading / vacío / error

- **Loading:** `Skeleton` (NUEVO `components/ui/Skeleton.js`, shimmer con `--surface-2`) para BriefingCard, barras y dashboard. Nunca spinner solo. La línea de estado del coach dice "Analizando tu día…".
- **Vacío (día sin datos / usuario nuevo):** BriefingCard en modo bienvenida — el coach propone la primera acción ("Empecemos con tu desayuno"), CTA registrar. Dashboard: cada widget con `EmptyState` accionable ("Registra tu peso para ver tu tendencia"). **Nunca** un cero mudo.
- **Error:** inline y humano, con **Reintentar** (patrón ya usado en coach). Nada de errores técnicos. Si falla el insight del coach, degradar al fallback determinista (las cifras siempre se muestran).

---

## 7. Responsive y accesibilidad

- **Móvil-first:** contenedor `max-width: var(--maxw)` (480), `padding-bottom` = alto del TabBar + safe-area. FAB y TabBar fijos; el contenido hace scroll.
- **Tablet/desktop:** subir `max-width` a ~640; BriefingCard puede poner el anillo a la izquierda y macros/CoachLine a la derecha en `@media (min-width:640px)`; dashboard en grid 2-col.
- **A11y WCAG-AA:** contrastes por token (ya AA); `MacroBar` con `role="progressbar"` + `aria-valuenow/min/max`; anillo kcal ya `role="meter"`; TabBar `role="tablist"`/`tab`/`aria-current`; foco visible global (`:focus-visible` ya vivo); targets ≥44px; color de macro **siempre** con label+valor (no solo color, daltonismo); `reduced-motion` respetado.
- **PWA:** `theme-color` por tema, safe-areas, el TabBar no se rompe con el teclado (solo el composer del coach sube).

---

## 8. Reconciliación y pendientes
- **NO se inventa sistema:** todo cuelga de los tokens y componentes vivos; los únicos "nuevos" son composiciones (BriefingCard, MacroBar, CoachLine, TabBar, cards de dashboard) sobre el sistema existente.
- **Pendiente de sistema (mi lane):** cargar **Inter** vía `next/font` (hoy `system-ui`) — sube el feel premium transversal.
- **Dependencias Karpathy:** endpoints para línea de estado/insight de HOME, CoachLine conversacional, entreno del día, y —para el dashboard— **predicción de objetivo/ETA** y tendencia de peso. Marco cada uno con fallback para no bloquear el build de la UI.
- **Coordinación:** el chat del Coach (feel ChatGPT) ya está especificado en `plan/coach-ui-rediseno.md`; este doc entrega la HOME-briefing, la navegación permanente y la dirección del dashboard. No construir hasta que Lugia secuencie.
