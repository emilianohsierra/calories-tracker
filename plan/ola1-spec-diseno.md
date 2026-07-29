# Ola 1 — Spec de Diseño Implementable (para CTO)

**Rol:** UX/UI Lead · **Autor:** Rams Design (skm3lj3d) · **Fecha:** 2026-07-28
**Base:** `plan/rediseno-sistema-diseno.md`, `plan/rediseno-vision-experiencia.md` · Datos: Karpathy · Producto: Drucker
**Objetivo:** que el CTO (Torvalds) construya la Ola 1 **sin adivinar**. Valores concretos, specs de componente, mapeo a archivos actuales.
**Prioridad de build:** ① Tokens → ② Shell → ③ **HOME** → ④ **Onboarding + revelación del plan** → ⑤ Consejo del día → ⑥ Rachas → ⑦ Paywall (reusar).
**Stack:** Next.js 15 App Router + React 19, móvil-first, PWA. Sin librerías de UI pesadas; anillos/gráficas en SVG (patrón `components/WeekChart.js`).

---

## 1. TOKENS FINALES (valores concretos)

Van en `app/globals.css` como custom properties bajo `:root` y `[data-theme="dark"]`. Si se usa Tailwind, mapear con `theme.extend` (bloque al final de §1).

### 1.1 Color

```css
:root {
  /* Superficies (light) */
  --bg:            #FBFBF9;
  --surface:       #FFFFFF;
  --surface-2:     #F4F4F1;
  --border:        rgba(20, 22, 26, 0.08);
  --border-strong: rgba(20, 22, 26, 0.14);
  --overlay:       rgba(12, 13, 15, 0.45);

  /* Texto (light) — contrastes AA verificados sobre --surface */
  --text:   #14161A;   /* 15.8:1 */
  --text-2: #52555C;   /* 7.4:1  */
  --text-3: #6B6F77;   /* 4.9:1 — solo >=13px */

  /* Marca verde-teal */
  --brand:        #0E7C6B;   /* AA sobre blanco 4.7:1 para texto grande/UI; texto normal usar --brand-strong */
  --brand-strong: #0A5F52;   /* 6.6:1 — texto normal sobre blanco */
  --brand-ink:    #FFFFFF;   /* texto sobre --brand */
  --brand-tint:   #E3F3F0;   /* fondos suaves, tracks */

  /* Nutrientes (consistentes en TODA la app) */
  --protein: #E4572E;
  --carbs:   #F2A93B;
  --fat:     #6C7BF2;
  --fiber:   #7BAE4B;
  --water:   #3BA9F2;

  /* Estados */
  --ok:   #1E874B;  --ok-tint:   #E4F3EA;
  --warn: #B87710;  --warn-tint: #FBF0D6;   /* warn oscurecido a AA sobre blanco (4.6:1) */
  --over: #C64545;  --over-tint: #F7DFDF;

  /* Sombras */
  --shadow-1: 0 1px 2px rgba(12,13,15,0.06);
  --shadow-2: 0 4px 16px rgba(12,13,15,0.10);
  --shadow-3: 0 8px 28px rgba(12,13,15,0.14);   /* orbe/hoja */
  --ring-focus: 0 0 0 3px rgba(14,124,107,0.30);
}

[data-theme="dark"] {
  --bg:            #0C0D0F;
  --surface:       #16181C;
  --surface-2:     #1E2126;
  --border:        rgba(255,255,255,0.10);
  --border-strong: rgba(255,255,255,0.16);
  --overlay:       rgba(0,0,0,0.60);

  --text:   #F2F3F5;
  --text-2: #A9AEB8;
  --text-3: #7C828C;   /* solo >=13px */

  --brand:        #2BC4AC;   /* sobre surface oscuro, AA */
  --brand-strong: #4FD8C2;
  --brand-ink:    #06231E;
  --brand-tint:   rgba(43,196,172,0.14);

  --protein: #F0714D; --carbs: #F4B857; --fat: #8A96F5; --fiber: #97C466; --water: #5CBAF5;

  --ok:   #34B36B;  --ok-tint:   rgba(52,179,107,0.16);
  --warn: #E0A63A;  --warn-tint: rgba(224,166,58,0.16);
  --over: #E56A6A;  --over-tint: rgba(229,106,106,0.16);

  --shadow-1: 0 1px 2px rgba(0,0,0,0.4);
  --shadow-2: 0 4px 16px rgba(0,0,0,0.5);
  --shadow-3: 0 8px 28px rgba(0,0,0,0.6);
  --ring-focus: 0 0 0 3px rgba(43,196,172,0.40);
}
```
Selección de tema: por `@media (prefers-color-scheme)` **y** override manual `data-theme` en `<html>` (persistir en `localStorage`, aplicar en `app/layout.js` antes de pintar para evitar flash).

### 1.2 Tipografía
```css
:root {
  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  /* Números: SIEMPRE tabulares */
  --nums: "tnum" 1, "lnum" 1;   /* usar via font-feature-settings en .num */
}
.num { font-variant-numeric: tabular-nums lining-nums; }
```
Cargar Inter con `next/font/google` (`Inter`, subsets latin, `display: swap`, variable `--font-sans`). Escala (font-size / line-height / weight):

| Token | px / lh | weight | Uso |
|---|---|---|---|
| `text-display` | 44 / 48 | 700 | hero kcal, revelación del plan |
| `text-h1` | 28 / 34 | 700 | títulos de pantalla |
| `text-h2` | 22 / 28 | 600 | secciones |
| `text-h3` | 17 / 24 | 600 | títulos de tarjeta |
| `text-body` | 15 / 22 | 400 | base |
| `text-sub` | 13 / 18 | 500 | secundario |
| `text-caption` | 12 / 16 | 500 | labels (nunca color `--text-3` <13px) |

### 1.3 Espaciado, radios, motion, layout
```css
:root {
  /* Espaciado base 4px */
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:20px; --s6:24px; --s8:32px; --s10:40px; --s12:48px;
  /* Radios */
  --r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:20px; --r-pill:999px;
  /* Motion */
  --dur-fast:120ms; --dur-base:200ms; --dur-slow:360ms; --dur-ring:700ms;
  --ease-standard: cubic-bezier(.2,0,0,1);
  --ease-spring:   cubic-bezier(.34,1.56,.64,1);
  /* Layout */
  --maxw: 480px;            /* contenedor móvil-first centrado */
  --tabbar-h: 64px;
  --touch: 44px;            /* target táctil mínimo */
}
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .001ms !important; transition-duration: .001ms !important; }
}
```
Safe areas PWA: usar `env(safe-area-inset-bottom)` en la tab bar y `env(safe-area-inset-top)` en headers.

### 1.4 Mapeo Tailwind (si se adopta) — `tailwind.config.js`
```js
theme: {
  extend: {
    colors: {
      bg:'var(--bg)', surface:'var(--surface)', 'surface-2':'var(--surface-2)',
      border:'var(--border)', text:'var(--text)', 'text-2':'var(--text-2)', 'text-3':'var(--text-3)',
      brand:'var(--brand)', 'brand-strong':'var(--brand-strong)', 'brand-tint':'var(--brand-tint)',
      protein:'var(--protein)', carbs:'var(--carbs)', fat:'var(--fat)', fiber:'var(--fiber)', water:'var(--water)',
      ok:'var(--ok)', warn:'var(--warn)', over:'var(--over)',
    },
    borderRadius: { sm:'8px', md:'12px', lg:'16px', xl:'20px', pill:'999px' },
    boxShadow: { e1:'var(--shadow-1)', e2:'var(--shadow-2)', e3:'var(--shadow-3)' },
    fontFamily: { sans:'var(--font-sans)' },
    maxWidth: { app:'480px' },
  }
}
```
> **Recomendación:** el proyecto ya usa CSS plano (`app/globals.css`). Ola 1 puede hacerse **sin** migrar a Tailwind — basta extender el CSS actual con estos tokens. Dejar Tailwind como opcional para no bloquear el build.

---

## 2. SHELL DE NAVEGACIÓN

**Componente nuevo:** `components/AppShell.js` (envuelve el contenido en `app/layout.js` o `app/page.js`).

### 2.1 Estructura
```
<AppShell>
  <main class="app-scroll">  {contenido de la pantalla activa}  </main>
  <TabBar active={tab} />           ← fija abajo, safe-area
</AppShell>
```
- Contenedor: `max-width: var(--maxw)`, centrado, `padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 8px)`.
- Ola 1 puede ser **una sola ruta** (`app/page.js`) con estado de tab en cliente; onboarding vive **fuera** del shell (ruta `app/onboarding/`). No requiere router complejo para Ola 1.

### 2.2 TabBar — spec (`components/TabBar.js`)
4 destinos + orbe central. En Ola 1, Coach y Plan pueden ir como "próximamente" (bloqueados con teaser) si su pantalla no entra en la ola; **Home y Progreso son las activas**.
```
┌──────────────────────────────────────────────┐
│  [Inicio]  [Progreso]   (◎)   [Plan]  [Perfil]│
└──────────────────────────────────────────────┘
                       ▲ orbe Coach, elevado -12px
```
- Altura `--tabbar-h` (64px) + safe-area. `background: var(--surface)`, `border-top: 1px var(--border)`, `box-shadow: var(--shadow-2)` hacia arriba.
- **Ítem de tab:** columna icono(24) + label(`text-caption`). Activo = `--brand`; inactivo = `--text-3`. Target ≥44px. `aria-current="page"` en el activo. `role="tablist"`/`tab`.
- **Orbe Coach (central):** botón circular 56px, elevado -12px sobre la barra, `background: var(--brand)`, icono de chat/orbe `--brand-ink`, `box-shadow: var(--shadow-3)`. Animación de "respiración" en reposo: `transform: scale(1↔1.03)` 4s ease-in-out infinite (desactivada con reduced-motion). Al pulsar → abre hoja Coach (en Ola 1: hoja "Tu coach llega pronto" + teaser). `aria-label="Coach IA"`.
- Iconos: set lineal 1.5–2px (Lucide o equivalente inline SVG). **Prohibido emoji como icono de navegación.**

---

## 3. HOME CONVERSACIONAL  *(PRIORIDAD 1)*

**Archivo:** reescribe `app/page.js` (componibles nuevos abajo). Reusa lógica de fetch de `meals`/`summary`/`settings` ya existente.

### 3.1 Orden vertical (móvil, scroll) y specs
```
┌─ GreetingHeader ─────────────────────────────┐  componente nuevo
│  "Buenos días, Emiliano"     [avatar 36px]   │  text-h2, --text
│  <subtítulo del coach, 1 línea>              │  text-sub, --text-2
├─ CoachTipCard (Consejo del día) ─────────────┤  §5 — hero compartible
├─ DayProgress (anillos) ──────────────────────┤  héroe de datos
│     ◯ anillo kcal grande + 3 mini macros     │
├─ QuickActions (fila de chips) ───────────────┤
│  [Registrar] [Agua +1] [Ver plan]            │
├─ MealTimeline (comidas de hoy) ──────────────┤  reusa MealList
├─ StreakBar (racha + reto) ───────────────────┤  §6
└─ FAB Registrar (flotante sobre tab bar) ─────┘
```

### 3.2 GreetingHeader (`components/GreetingHeader.js`) — nuevo
- Saludo por hora local: <12h "Buenos días" · 12–19h "Buenas tardes" · resto "Buenas noches". Nombre desde perfil (`/api/settings` o perfil de usuario).
- Subtítulo: en Ola 1, texto del **Consejo del día** corto o fallback estático por objetivo si el motor aún no responde (`[IA→Karpathy]`, fallback `[REAL]`).
- `padding: var(--s5) var(--s4) var(--s3)`; avatar a la derecha (abre Perfil).

### 3.3 DayProgress + ProgressRing (`components/DayProgress.js`, `components/ProgressRing.js`) — nuevos
Sustituye/renueva `components/DailySummary.js` (reusa su lógica de `state = over|warn|ok`).
- **ProgressRing (SVG):** anillo circular. Props: `value, goal, size=160, stroke=14, color, track`. Arco = `min(value/goal,1)`. `--dur-ring` con `--ease-spring` al montar/actualizar. Centro: `<span class="num text-display">{kcal}</span>` + `de {goal} kcal` (`text-sub`). Color por estado: ok=`--brand`, warn=`--warn`, over=`--over`.
- **3 mini-anillos** (size 56, stroke 6) proteína/carbos/grasa con sus colores de nutriente + label `text-caption` + `Xg/​Yg`.
- **A11y:** `role="meter"` `aria-valuemin=0` `aria-valuemax=goal` `aria-valuenow=value` `aria-label="Calorías del día"`. (Ya parcial en `DailySummary.js`.)
- Mensaje de estado bajo el anillo (reusar copys actuales): ok "Vas bien: te quedan N kcal" / warn / over. **Sin rojo agresivo**; over usa `--over` pero copy amable.
- Editar meta: mantener el patrón de `DailySummary.js` (link "Editar meta" → input 500–10000).

### 3.4 QuickActions
Fila de chips (`--r-pill`, `--surface-2`, borde `--border`, target ≥44px): **Registrar** (abre LogSheet/cámara), **Agua +1** (`[INPUT]`, incrementa hidratación local — si el endpoint no existe en Ola 1, guardar en settings/estado y marcar `[V2]`), **Ver plan** (Ola 1: teaser).

### 3.5 MealTimeline
Reusa `components/MealList.js` tal cual (ya renderiza tarjetas con miniatura/macros/borrar). Ajustes: corregir target del botón borrar a ≥44px y foco visible (ver §8). Estado vacío: **no** cero mudo — copy del coach "Empecemos con tu desayuno — tómale una foto" + CTA.

### 3.6 FAB Registrar
Botón flotante `--brand`, 56px, esquina inferior derecha sobre la tab bar (`bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 12px)`). Abre el flujo de registro (reusa `components/AddMealModal.js`; ideal Ola 1: auto-analizar al capturar, ver mejora #1 de `plan/ux-rediseno.md`). Mantener input cámara/galería existente de `app/page.js`.

### 3.7 Datos que consume HOME
| Elemento | Fuente | Estado |
|---|---|---|
| kcal/macros del día vs meta | `GET /api/meals?date` + `/api/settings` | `[REAL]` |
| comidas de hoy | `GET /api/meals?date` | `[REAL]` |
| saludo/nombre | perfil/settings | `[REAL]` |
| consejo del día | endpoint coach | `[IA→Karpathy]` fallback estático |
| racha | derivado de historial (§6) | `[REAL derivable]` |
| agua +1 | endpoint hidratación | `[INPUT/V2]` |

---

## 4. ONBOARDING POR OBJETIVOS + REVELACIÓN  *(PRIORIDAD 2)*

**Ruta nueva:** `app/onboarding/page.js` (fuera del shell). Estado de wizard en cliente; persistir al final vía `PUT /api/settings` (+ tabla de perfil nueva — coordinar CTO/Karpathy). 6 pasos con barra de progreso.

### 4.1 Flujo y componentes
```
Paso 1  Bienvenida            → WelcomeStep      (valor + CTA "Empecemos")
Paso 2  ¿Qué buscas?          → GoalPicker       (6 categorías → sub-objetivos, multi + primario)
Paso 3  Datos base            → BaseDataStep      (sexo, edad, peso, altura, actividad)
Paso 4  Parámetros x objetivo → ObjectiveParams   (ramificado: solo objetivos elegidos + dieta/intolerancias)
Paso 5  Calculando            → CalculatingStep   (2–3s anillos llenándose)
Paso 6  Tu plan               → PlanReveal        (kcal + macros + CTA "Registrar mi primera comida")
```
Contenedor `OnboardingWizard.js` (barra de progreso 1–6, botón atrás, "Saltar" → plan de salud general por defecto).

### 4.2 Specs por paso
- **GoalPicker (Paso 2):** grid 2 columnas de **6 tarjetas-categoría** (A Salud · B Composición · C Rendimiento · D Fuerza · E Dieta · F Médica — taxonomía de Karpathy §1). Tap → expande chips de sub-objetivos in situ. Multi-selección; luego un tap fija **objetivo primario**. Si eligen combo en conflicto (perder grasa + ganar músculo) → microcopy no-bloqueante sugiere "Recomposición". **Ola 1:** habilitar solo objetivos no-médicos (A/B/C/D + dietas); F "Médica" visible pero marcada "Próximamente" (Drucker Ola 4). 
- **BaseDataStep (Paso 3):** un campo por pantalla estilo card. sexo (segmented), edad (stepper), peso/altura (slider+input, unidad kg/cm con toggle lb), actividad (5 niveles PAL con descripción humana — mapear a 1.2/1.375/1.55/1.725/1.9 de Karpathy §2.2). Todos con default. Teclado numérico correcto (`inputmode`).
- **ObjectiveParams (Paso 4):** render condicional por objetivo elegido, 1–3 preguntas c/u (ritmo de pérdida, días de entreno, deporte, patrón de dieta, intolerancias/alergias). Alergias/intolerancias = chips (filtro duro, Karpathy §3.3).
- **CalculatingStep (Paso 5):** anillos llenándose + microcopy rotativo ("Ajustando tus macros…"). 2–3s reales o hasta que responda el cálculo. Respeta reduced-motion (fundido simple).
- **PlanReveal (Paso 6):** **momento ajá.** `ProgressRing` grande con kcal objetivo (`text-display`) + 3 anillos de macros (usa Mifflin-St Jeor/TDEE/macros de Karpathy §2.2) + línea de fibra/hidratación + chips de objetivos activos. CTA primario "Registrar mi primera comida" → HOME con LogSheet. **El muro NO aparece aquí** (activación primero — Drucker/Rams).

### 4.3 Cálculo (contrato con Karpathy)
Entrada: `{sexo, edad, peso_kg, altura_cm, PAL, objetivo_primario, objetivos_sec[], patron_dieta, intolerancias[]}`.
Salida esperada: `{kcal_objetivo, rango_kcal[], macros:{prot_g,carb_g,gras_g}, fibra_g, hidratacion_ml}`.
Fórmulas ya especificadas por Karpathy (`plan/rediseno-coach-ia.md`/`premium-vision-nutricion-ia.md` §2.2): BMR Mifflin-St Jeor, TDEE=BMR·PAL, déficit/superávit por objetivo, macros por g/kg. **El motor lo implementa Karpathy/CTO; UI solo consume el JSON.**

---

## 5. CONSEJO DEL DÍA — tarjeta hero compartible

**Componente nuevo:** `components/CoachTipCard.js`. Vive en HOME (§3.1), bajo el saludo.

### 5.1 Spec visual
- Tarjeta destacada: `background: linear-gradient(135deg, var(--brand-tint), var(--surface))`, `border-radius: var(--r-lg)`, `padding: var(--s5)`, `box-shadow: var(--shadow-1)`.
- Encabezado: micro-etiqueta "Consejo de hoy" (`text-caption`, `--brand-strong`) + icono coach.
- Cuerpo: consejo `text-h3`/`text-body`, 1–2 frases, `--text`. Anclado a datos del usuario (`[IA→Karpathy A3]`). Fallback Ola 1: consejo semi-genérico por objetivo si el motor no responde.
- Acción: botón fantasma **"Compartir"** (icono share) + opcional micro-CTA contextual.

### 5.2 Compartir (viralidad)
- Generar imagen de la tarjeta para stories/WhatsApp. **Ola 1 (simple):** usar **Web Share API** (`navigator.share`) con texto + URL de la app; si no hay soporte, copiar al portapapeles.
- **Ola 1.5 (imagen):** render de tarjeta a PNG. Preferir **OG Image dinámica** de Next (`ImageResponse` en una ruta `app/share/tip/route.js`) con el texto del consejo, marca discreta y **cero PII** (nunca nombre/peso/datos de salud). Alternativa cliente: `html-to-image`.
- Marca discreta (logo + "hecho con [app]"). Métrica a instrumentar: compartidos/usuario activo (para k-factor — Drucker).
- **Guardrail:** el texto pasa por los guardrails clínicos de Karpathy; nada sensible en la imagen.

---

## 6. RACHAS

**Componente nuevo:** `components/StreakBar.js` (resumen en HOME) — detalle completo en pestaña Progreso (posterior).
- **Lógica (derivable de datos existentes):** racha = nº de días consecutivos hasta hoy con al menos 1 comida registrada (regla Drucker: racha de **registro/hábito**, no de dieta). Calcular en servidor (`GET /api/summary`) o cliente sobre el historial.
- **Racha congelada / comodín:** 1 día de gracia por semana no rompe la racha (anti-ansiedad). Guardar `freezes_disponibles`.
- **Visual:** píldora con icono de racha (llama lineal) + "N días" (`.num`) + barra de reto opcional. Colores cálidos, **nunca** culpa si se rompe: copy "Retomamos hoy".
- **Celebración:** al cerrar día/subir racha → `Toast` + `ConfettiBurst` breve (≤1.2s, reduced-motion aware). Componentes en §7.

---

## 7. PAYWALL (reusar existente)

**Archivo:** `components/UpgradeModal.js` ya existe (+ `lib/stripe.js`, `app/api/checkout`, `app/api/portal`, `app/api/stripe`, `lib/usage.js`). **No reconstruir**; re-vestir con tokens y copy de promesa.
- **Re-skin:** aplicar tokens §1 (superficies, `--brand`, radios, sombras), tipografía Inter, foco visible.
- **Copy (Drucker "vender tranquilidad"):** título *"No cuentes calorías solo. Ten un coach que se ocupa de que llegues a tu meta."* + 3 bullets de valor (coach ilimitado, ajuste de tu plan, reporte semanal) + comparativa Free/Pro + **anual destacado con ahorro** ($99/mes · $799/año · trial 7 días).
- **Disparadores del muro (Ola 1):** al agotar los 10 análisis de foto/mes o las 3 preguntas de coach/mes (`lib/usage.js`), y al intentar 2º objetivo. **Nunca** durante onboarding/revelación.
- **Patrón de widget bloqueado:** `LockedOverlay` (nuevo, ligero): contenido real difuminado + candado + microcopy + CTA que abre `UpgradeModal`.

---

## 8. ACCESIBILIDAD (WCAG-AA) — obligatorio en cada componente

- **Foco visible:** añadir a `globals.css` regla global `:focus-visible { outline: none; box-shadow: var(--ring-focus); border-radius: inherit; }`. (Hoy ausente.)
- **Targets ≥44px:** corregir `icon-btn`/borrar de `MealList.js` y nav de fecha.
- **Contraste:** pares ya verificados en §1; `--text-3` nunca <13px. Nutrientes siempre con label/valor, no solo color.
- **Semántica:** anillos `role="meter"`; tab bar `role="tablist"`; hojas `role="dialog" aria-modal`; `aria-live="polite"` para toasts.
- **Motion:** todo respeta `prefers-reduced-motion` (regla global en §1.3).
- **PWA:** `app/manifest.json` (nombre, iconos 192/512, `theme-color` por tema, `display: standalone`), safe-area insets, `<meta name="theme-color">` dinámico. Service worker básico para shell offline (Ola 1 opcional).

---

## 9. MAPEO A ARCHIVOS DEL REPO

| Componente/spec | Archivo | Acción |
|---|---|---|
| Tokens | `app/globals.css` | **Extender** con §1 (custom properties + dark) |
| Fuente Inter | `app/layout.js` | `next/font/google` Inter, variable |
| AppShell | `components/AppShell.js` | **Nuevo** |
| TabBar + orbe Coach | `components/TabBar.js` | **Nuevo** |
| HOME (orquestador) | `app/page.js` | **Reescribir** sobre lógica de fetch existente |
| GreetingHeader | `components/GreetingHeader.js` | **Nuevo** |
| ProgressRing | `components/ProgressRing.js` | **Nuevo** (SVG, patrón `WeekChart.js`) |
| DayProgress | `components/DayProgress.js` | **Nuevo** (reusa lógica de `DailySummary.js`) |
| CoachTipCard | `components/CoachTipCard.js` | **Nuevo** |
| StreakBar | `components/StreakBar.js` | **Nuevo** |
| MealTimeline | `components/MealList.js` | **Reusar** + fix a11y |
| Registro | `components/AddMealModal.js` | **Reusar** (ideal: auto-analizar) |
| Onboarding | `app/onboarding/page.js` + `components/onboarding/*` | **Nuevo** |
| Consejo compartible (imagen) | `app/share/tip/route.js` | **Nuevo** (OG ImageResponse) |
| Paywall | `components/UpgradeModal.js` | **Reusar** + re-skin |
| LockedOverlay | `components/LockedOverlay.js` | **Nuevo** (ligero) |
| Toast / ConfettiBurst / Skeleton / EmptyState | `components/ui/*` | **Nuevos** (primitivos) |
| Contador de uso Free/Pro | `lib/usage.js` | **Reusar** |
| Cálculo del plan | (motor Karpathy) | **Dependencia** — UI consume JSON §4.3 |

---

## 10. ORDEN DE IMPLEMENTACIÓN Y DEPENDENCIAS

1. **Tokens + fuente + foco visible** (`globals.css`, `layout.js`) — base de todo.
2. **ProgressRing** (aislado, testeable) → **DayProgress**.
3. **HOME**: GreetingHeader + DayProgress + MealTimeline + FAB (rebanada visible más temprana).
4. **AppShell + TabBar + orbe** (Coach/Plan como teaser en Ola 1).
5. **Onboarding** (6 pasos) + **PlanReveal** — depende del **motor de cálculo de Karpathy** (§4.3). Mientras llega, mockear el JSON de salida para no bloquear la UI.
6. **CoachTipCard** + compartir (Web Share primero, imagen después) — depende del endpoint de consejo (fallback estático).
7. **StreakBar** + Toast/Confetti.
8. **Paywall re-skin** + LockedOverlay + cableado de disparadores con `lib/usage.js`.

**Bloqueantes a resolver con el equipo:**
- **Karpathy:** endpoint de cálculo del plan (§4.3) y endpoint/fallback del consejo del día (§5). Persistencia del perfil de onboarding (tabla nueva).
- **CTO:** dónde persiste el perfil de objetivos y la racha/comodines; si se adopta Tailwind (opcional) o se extiende el CSS actual (recomendado para no frenar Ola 1).
- **Drucker:** confirmar disparadores exactos del muro y límites Free (10 fotos/3 chat) ya en `lib/usage.js`.

> **Nota de navegación:** el orbe central Coach (mi sistema) y el tab "Coach" del roadmap de Drucker convergen — en Ola 1 el Coach aún no está activo, así que el orbe entra como teaser y la decisión final de forma no bloquea el build de HOME/onboarding.
