# Mi Coach — Rediseño completo de UI (de chat crudo a producto premium)

**Rol:** UX/UI Lead · **Autor:** Rams Design (skm3lj3d) · **Fecha:** 2026-07-31
**Sobre:** código actual `app/coach/page.js` (BUILD v9), `components/coach/PersonalityPicker.js`, `app/globals.css` (tokens Ola 1, líneas 716–824)
**Calidad objetivo:** ChatGPT (render de mensajes) + Apple Health / Oura (calma, datos claros, dark de primera clase).
**REGLA DE ORO (toda respuesta):** el usuario debe ver, en orden, **(a) qué necesita saber** y **(b) qué hacer ahora**. Menos elementos, mejor diseñados.

---

## 0. Diagnóstico del estado actual (qué está roto)

| # | Problema en el código actual | Ref |
|---|---|---|
| 1 | Emoji 👋 en el saludo | `page.js:14,16` |
| 2 | `build v9` visible en la cabecera del usuario | `page.js:9,95` |
| 3 | Respuesta plana: `data.text` en `white-space:pre-wrap` → si el modelo manda Markdown (`## ** \| ---`), se ve **crudo** | `page.js:80`, `globals.css:812` |
| 4 | Sin tarjetas (nutrición/comida/recomendación/progreso/entreno) | — |
| 5 | Carga = un `…` como texto | `page.js:104` |
| 6 | Error técnico expuesto: `${data.error} (${data.reason})` | `page.js:77` |
| 7 | Composer = input + botón `↑`, sin cámara/voz/＋ | `page.js:109-121` |
| 8 | Tone picker = chips sin preview ni identidad | `PersonalityPicker.js` |
| 9 | **No existe dark mode ni toggle** (no hay `[data-theme]` ni `prefers-color-scheme` en `globals.css`) | `globals.css` |

Este spec corrige los 9 y sube el listón a premium. Todo es **aditivo** sobre los tokens existentes.

---

## 1. TIPOGRAFÍA — jerarquía clara, sin gigantismo

Mantener **Inter** (ya en tokens). Definir 4 roles y usarlos con disciplina. Nada de texto gigante en el chat, negrita solo para el dato clave, **cero MAYÚSCULAS** salvo el eyebrow de sección.

```css
/* añadir a globals.css */
.c-title   { font-size:17px; line-height:24px; font-weight:600; color:var(--text); letter-spacing:-.01em; }
.c-subtitle{ font-size:13px; line-height:18px; font-weight:500; color:var(--text-2); }
.c-body    { font-size:15px; line-height:22px; font-weight:400; color:var(--text); }
.c-data    { font-size:15px; font-weight:600; color:var(--text); font-variant-numeric:tabular-nums lining-nums; }
.c-eyebrow { font-size:11px; line-height:14px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--text-3); }
```
- Burbuja del coach usa `.c-body`; cifras dentro con `.c-data`. Títulos de tarjeta `.c-title`.
- Regla: **una** negrita por mensaje como máximo (el dato accionable). El resto peso 400.

---

## 2. SIN EMOJIS · iconografía minimalista

- **Eliminar** el 👋 del saludo (`page.js:14,16`) y cualquier emoji en respuestas (instrucción también al prompt de Karpathy: "no uses emojis").
- Set único de **iconos lineales 1.5px** (Lucide inline SVG), 20px en chips/acciones, 16px inline. `stroke:currentColor`.
- Iconos permitidos: cámara, micrófono, más (＋), enviar (flecha arrow-up), sol/luna/monitor (tema), utensilios, actividad, tendencia, gota, fuego (racha), info. **Ningún emoji** como sustituto de icono.

---

## 3. MENSAJES RENDERIZADOS — nunca Markdown crudo

El modelo tiende a devolver Markdown. **Dos capas de defensa:**

1. **Preferir salida estructurada** (contrato con Karpathy): el endpoint devuelve
   ```json
   { "text": "1-3 frases en prosa, sin markdown", "cards": [ { "type":"meal|nutrition|recommendation|progress|workout", ... } ] }
   ```
   La UI renderiza `text` como prosa + las `cards` como componentes (§4). Es el camino premium.
2. **Sanitizar por si acaso** (defensa en UI): un `renderMessage(text)` que:
   - convierte `**x**`/`__x__` → `<strong>`, `*x*` → `<em>`;
   - listas `- `/`1.` → `<ul>/<ol>` con estilo propio;
   - **descarta** `#`, `---`, tablas `|...|`, bloques de código (los convierte a texto/plano o los rutea a una tarjeta);
   - nunca imprime `##`, `**`, `|` literales.
   Implementar como parser mínimo (sin dependencia pesada) o `react-markdown` + `remark` con **allowlist** de nodos (párrafo, strong, em, ul/ol/li) y todo lo demás desactivado.

**Componente:** `components/coach/RichMessage.js` — recibe `{text, cards}` y decide. Reemplaza el render plano de `page.js:103-106`.

```css
.chat-bubble strong{font-weight:600}
.chat-bubble ul,.chat-bubble ol{margin:6px 0 0;padding-left:18px}
.chat-bubble li{margin:2px 0}
.chat-bubble{white-space:normal}   /* quitar el pre-wrap actual */
```

---

## 4. TARJETAS accionables (dentro de la burbuja del coach)

Todas comparten contenedor `.c-card` y la **regla de oro**: dato arriba, acción abajo. Máx 1–2 tarjetas por mensaje. Nuevos archivos en `components/coach/cards/`.

```css
.c-card{ background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md);
  padding:var(--s4); margin-top:var(--s2); box-shadow:var(--shadow-1); }
.c-card + .c-card{ margin-top:var(--s3); }
.c-card__actions{ display:flex; gap:var(--s2); margin-top:var(--s3); }
.macro-chip{ display:inline-flex; align-items:center; gap:6px; font-size:13px; }
.macro-dot{ width:8px;height:8px;border-radius:50%; }   /* color por nutriente */
```

### 4.1 NutritionCard (`cards/NutritionCard.js`)
kcal + prot/carbs/grasa/fibra. **Anillo** de kcal (reusa `ProgressRing`/patrón `WeekChart.js`) + 4 mini-barras de macro con color de nutriente y valor `.c-data`.
```
props: { kcal, goalKcal?, protein_g, carbs_g, fat_g, fiber_g }
layout: [anillo kcal]  |  Proteína ▁▃ 82g · Carbos ▁▅ 120g · Grasa ▁▂ 40g · Fibra ▁▂ 18g
```
Barras: `height:6px; border-radius:3px; background:var(--surface-2)`, relleno con `--protein/--carbs/--fat/--fiber`.

### 4.2 MealCard (`cards/MealCard.js`)
```
props: { title, kcal, protein_g, ingredients[], onRegister, onAnother }
```
Título `.c-title` · kcal `.c-data` + `Proteína Xg` · ingredientes como texto discreto `.c-subtitle` (máx 1 línea, elipsis). Acciones: **[Registrar]** primario → POST `app/api/meals` (toast + sube anillo en HOME) · **[Otra opción]** fantasma.

### 4.3 RecommendationCard (`cards/RecommendationCard.js`)
Texto de consejo `.c-body` + acciones **[Ver opciones]** (re-pregunta) / **[Registrar]**. Para "¿qué ceno?".

### 4.4 ProgressCard (`cards/ProgressCard.js`)
Semana vs objetivo + tendencia + %. Reusa `WeekChart.js` (mini) o barra de adherencia. `props:{ adherence_pct, trend:'up|flat|down', weekly:[...], goalKcal }`. 1 línea de veredicto arriba (`.c-body`), gráfica abajo. Flecha de tendencia como icono lineal (no emoji).

### 4.5 WorkoutCard (`cards/WorkoutCard.js`)
`props:{ title, when, fuel:{carbs_g,protein_g}, note }`. Qué comer alrededor del entreno. Acción **[Ver más]**.

> **Router de tarjetas:** `RichMessage` mapea `card.type` → componente. Si llega un `type` desconocido, degradar a texto (nunca romper).

---

## 5. INPUT premium (`components/coach/Composer.js`, reemplaza `page.js:109-121`)

```
┌─────────────────────────────────────────────┐
│ (＋)  Escribe a tu coach…            (🎙)(↑) │
└─────────────────────────────────────────────┘
```
- Contenedor `.coach-composer` (ya existe) refinado: `align-items:flex-end`.
- **＋** (icono, 44px, fantasma) → hoja: Cámara / Galería / Registro manual (reusa input file de `AddMealModal.js`).
- **textarea** auto-crece 1→5 líneas (no `input` de una línea como hoy), `.coach-composer textarea{ resize:none; max-height:120px; }`, placeholder "Escribe a tu coach…".
- **🎙** micrófono (icono, fantasma) — si no hay soporte de voz, ocultar (Fase 2 activa dictado).
- **↑ enviar:** botón **circular 36px** con icono flecha, `background:var(--brand)`, **no** el botón grande actual. Activo solo con texto. Enter envía, Shift+Enter salto.
- Sticky abajo, sube con teclado (`100dvh` + `visualViewport`).

```css
.coach-composer{ align-items:flex-end; gap:var(--s2); }
.coach-composer textarea{ flex:1; min-height:var(--touch); max-height:120px; padding:11px var(--s4);
  border:1px solid var(--border); border-radius:var(--r-lg); background:var(--surface-2);
  color:var(--text); font:inherit; font-size:15px; resize:none; }
.composer-icon{ width:44px;height:44px;display:grid;place-items:center;border-radius:50%;
  background:transparent;border:none;color:var(--text-2);cursor:pointer; }
.composer-send{ width:36px;height:36px;border-radius:50%;background:var(--brand);color:var(--brand-ink);
  display:grid;place-items:center;border:none;cursor:pointer; }
.composer-send:disabled{ opacity:.4;cursor:default; }
```

---

## 6. QUICK ACTIONS — chips modernos (`components/coach/QuickActions.js`)

Reusa `.chip-action` (ya en `globals.css:780`). Visibles cuando el hilo está inactivo; se ocultan al enviar. Icono lineal + label, scroll horizontal con snap, sin barra.

| id | label | efecto |
|---|---|---|
| `analizar` | Analizar comida | abre cámara (`AddMealModal`) |
| `puedo_comer` | ¿Qué puedo comer? | `send("¿Qué puedo comer con lo que me queda hoy?")` |
| `progreso` | Mi progreso | `send("¿Cómo voy esta semana?")` → ProgressCard |
| `plan_hoy` | Plan de hoy | `send("¿Cuál es mi plan de hoy?")` |
| `cambiar_objetivo` | Cambiar objetivo | `router.push('/perfil')` (editar plan) |

```css
.quick-actions{ overflow-x:auto; flex-wrap:nowrap; scroll-snap-type:x proximity; -ms-overflow-style:none; scrollbar-width:none; }
.quick-actions::-webkit-scrollbar{ display:none; }
.chip-action{ scroll-snap-align:start; white-space:nowrap; }
```

---

## 7. SELECTOR DE PERSONALIDAD elegante (`PersonalityPicker.js` — reescribir)

Misma identidad visual; **solo cambia el tono**. Añadir **preview en vivo** (hoy son chips pelados). Presentar como hoja o bloque colapsable, no barra permanente que roba altura al chat.

- 4 tonos: **Amigable · Entrenador · Analítico · Tranquilo** (default `tranquilo`). Textos preview (misma situación "te faltan 25 g de proteína") de Karpathy A2:
  - Amigable: "¡Casi lo tienes! Unos huevos con la cena y cierras el día."
  - Entrenador: "Te faltan 25 g y no los dejas hoy. Pechuga o huevos —se cierran."
  - Analítico: "Proteína 115/140 g (82%). +25 g = 130 g de pechuga → 100%."
  - Tranquilo: "Vas bien. Si te apetece, 25 g más redondean el día."
- Al tocar un chip → **reescribe una mini-burbuja de preview** con ese texto (feedback inmediato) y persiste vía `/api/coach/settings` (ya existe). Toast "Tu coach ahora te habla distinto".
- Chips: reusar `.tone-chip` pero subir target a 44px, y **mostrar el picker bajo un botón "Personalidad: Tranquilo ▾"** en la cabecera (no barra fija). Ahorra altura y se siente premium.

```css
.tone-preview{ align-self:flex-start; max-width:85%; background:var(--surface-2); color:var(--text-2);
  border:1px dashed var(--border); border-radius:var(--r-md); padding:var(--s3); font-size:14px; margin:var(--s2) 0; }
.tone-chip{ min-height:44px; }
```

---

## 8. DARK MODE completo y DISEÑADO (no invertir) + toggle

**No existe hoy.** Añadir paleta oscura con los hex de Emiliano y un toggle de apariencia.

### 8.1 Paleta (usar `[data-theme="dark"]`, valores de Emiliano)
```css
[data-theme="dark"]{
  --bg:            #0B0D10;   /* fondo app (no negro puro) */
  --surface:       #14171C;   /* cards */
  --surface-2:     #1A1E24;   /* secundarias/inputs/chips */
  --border:        rgba(255,255,255,0.08);
  --border-strong: rgba(255,255,255,0.14);

  --text:   #E6E8EB;          /* blanco apagado, no #FFF puro */
  --text-2: #A3A8B0;
  --text-3: #7C828C;

  --brand:        #2BC4AC;    /* teal más luminoso sobre oscuro (AA) */
  --brand-strong: #4FD8C2;
  --brand-ink:    #06231E;
  --brand-tint:   rgba(43,196,172,0.14);

  --protein:#F0714D; --carbs:#F4B857; --fat:#8A96F5; --fiber:#97C466; --water:#5CBAF5;
  --ok:#34B36B; --ok-tint:rgba(52,179,107,.16);
  --warn-c:#E0A63A; --warn-tint:rgba(224,166,58,.16);
  --over:#E56A6A; --over-tint:rgba(229,106,106,.16);

  --shadow-1:0 1px 2px rgba(0,0,0,.4);
  --shadow-2:0 4px 16px rgba(0,0,0,.5);
  --shadow-3:0 8px 28px rgba(0,0,0,.6);
  --ring-focus:0 0 0 3px rgba(43,196,172,.4);
}
```
Además, respetar sistema cuando el usuario elige "Sistema":
```css
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){ /* mismos overrides que [data-theme="dark"] */ }
}
```
> Implementación recomendada: aplicar el atributo `data-theme` en `<html>`, y duplicar el bloque oscuro para `[data-theme="dark"]` y para el `@media` cuando no hay override. (Un `@import`/mixin no aplica en CSS plano; duplicar el bloque o generar con un script de build.)

### 8.2 Toggle Apariencia (`components/ThemeToggle.js` + `lib/theme.js`)
- 3 opciones **segmented**: **Claro · Sistema · Oscuro**. Default **Sistema**. Persistir en `localStorage('theme')`.
- **Anti-flash:** script inline en `app/layout.js` (antes de pintar) que lee `localStorage` y setea `document.documentElement.dataset.theme` (o lo quita para "Sistema"). Ejemplo:
  ```html
  <script dangerouslySetInnerHTML={{__html:
    "try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}"}} />
  ```
- Ubicación del toggle: **Perfil → Apariencia** (y opcional acceso desde `⋯` del coach). No en la barra del chat.
- `<meta name="theme-color">` dinámico: `#0B0D10` en oscuro, `#FBFBF9` en claro.

---

## 9. AVATAR / identidad del Coach (minimalista, no robot, no emoji)

**Componente `components/coach/CoachOrb.js`** (SVG): orbe abstracto con gradiente radial `--brand`→`--brand-strong` + 1–2 arcos concéntricos sutiles. Nada de cara, robot ni emoji.
- Cabecera del chat: `<CoachOrb size={28}/>` junto a "Mi Coach". Coherente con el orbe del tab bar.
- En reposo, "respiración" muy sutil (scale 1↔1.03, 4s), off con reduced-motion.
```css
.coach-orb{ display:inline-block; }
@keyframes orbBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
.coach-orb.animate{ animation:orbBreath 4s var(--ease-standard) infinite; }
@media (prefers-reduced-motion:reduce){.coach-orb.animate{animation:none}}
```
**Quitar** `build v9` de la cabecera (`page.js:9,95`) — nunca en UI de usuario (moverlo a un comentario o `console.log`).

---

## 10. CARGA elegante + ERROR humano

### 10.1 Carga (`components/coach/TypingIndicator.js`)
- Reemplaza el `…` de `page.js:104`. Burbuja coach con 3 puntos que **respiran** + microcopy contextual rotativo: **"El Coach está analizando tu día…"**, "Revisando tus macros…", "Preparando una idea…".
```css
.coach-typing{ display:inline-flex; gap:4px; align-items:center; }
.coach-typing i{ width:6px;height:6px;border-radius:50%;background:var(--text-3);animation:coachDot 1.2s infinite; }
.coach-typing i:nth-child(2){animation-delay:.15s} .coach-typing i:nth-child(3){animation-delay:.3s}
@keyframes coachDot{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
@media (prefers-reduced-motion:reduce){.coach-typing i{animation:none;opacity:.6}}
```
- Si el backend hace streaming: mostrar puntos hasta el 1er token, luego append token a token. Si es JSON (estado actual, `page.js:75`): mostrar puntos hasta que llega la respuesta y **hacer fade-in** de la burbuja (no salto).

### 10.2 Error (reemplaza `page.js:77,80,82`)
- **Nunca** mostrar `data.reason` ni texto técnico. Mensaje único humano:
  > "No pude completar el análisis. Inténtalo de nuevo."
  con botón **[Reintentar]** que reenvía el último mensaje.
- Log técnico solo a `console.error`. La burbuja de error usa estilo neutro (no rojo agresivo), con la acción de reintento visible.
```css
.chat-error{ color:var(--text-2); }
.chat-error .retry{ margin-top:var(--s2); }
```

---

## 11. Microanimaciones + responsive

- **Microanimaciones (sutiles, con `--dur-base`/`--ease-standard`, todas off en reduced-motion):** burbuja entra con fade+translateY(6px); tarjeta con fade; orbe respira; chip al pulsar scale .97; anillo de NutritionCard se llena (`--dur-ring`).
- **Responsive:**
  - Móvil: `.coach-shell` ya `max-width:480px`, `height:100dvh`. Composer sticky, sube con teclado (`dvh` + `visualViewport`).
  - Tablet/desktop: subir `--maxw` del coach a ~640px centrado; burbujas máx 70% ancho; tarjetas en grid de 2 columnas si caben (`@media (min-width:640px)`).
  - Input **siempre fijo abajo**; el thread hace scroll, el header y composer no.
```css
@media (min-width:640px){
  .coach-shell{ max-width:640px; }
  .chat-bubble{ max-width:70%; }
}
```

---

## 12. Mapeo a archivos del repo

| Pieza | Archivo | Acción |
|---|---|---|
| Orquestador chat | `app/coach/page.js` | **Reescribir** render (RichMessage, cards, typing, error, composer); quitar emoji y `build v9` |
| Render de mensaje | `components/coach/RichMessage.js` | **Nuevo** (sanitiza markdown + rutea cards) |
| Tarjetas | `components/coach/cards/{Nutrition,Meal,Recommendation,Progress,Workout}Card.js` | **Nuevo** |
| Composer premium | `components/coach/Composer.js` | **Nuevo** (reemplaza input+botón) |
| Quick actions | `components/coach/QuickActions.js` | **Nuevo** |
| Typing/loader | `components/coach/TypingIndicator.js` | **Nuevo** |
| Orbe/identidad | `components/coach/CoachOrb.js` | **Nuevo** |
| Personalidad + preview | `components/coach/PersonalityPicker.js` | **Reescribir** (preview en vivo, target 44px, en `⋯`/cabecera) |
| Toggle tema | `components/ThemeToggle.js`, `lib/theme.js` | **Nuevo** |
| Anti-flash + meta theme-color | `app/layout.js` | **Editar** |
| Tokens dark + clases nuevas | `app/globals.css` | **Editar** (bloque `[data-theme="dark"]` + `@media prefers-color-scheme` + `.c-*`, `.coach-typing`, composer, cards) |
| Registrar / analizar | `app/api/meals`, `components/AddMealModal.js` | **Reusar** |
| Límite Free / paywall | `lib/usage.js`, `components/UpgradeModal.js` | **Reusar** |
| Respuesta estructurada | `app/api/coach/*` | **Coordinar Karpathy/CTO** (§3: `{text, cards[]}`, sin markdown, sin emojis) |

---

## 13. Prioridad de implementación
1. **Dark mode + toggle** (§8) — es lo más visible y hoy no existe; toca solo `globals.css` + `layout.js` + `ThemeToggle`.
2. **Quitar emoji + `build v9`, RichMessage sin markdown crudo** (§2,3,9) — corrige lo que se ve "barato".
3. **Composer premium + typing + error humano** (§5,10) — el chat se siente producto.
4. **Tarjetas** (§4) — empezar por **MealCard** y **NutritionCard** (las de mayor uso), luego Recommendation/Progress/Workout.
5. **Quick actions + PersonalityPicker con preview** (§6,7).

**Dependencia clave (Karpathy/CTO):** que `app/api/coach/chat` devuelva **`{text, cards[]}` estructurado, en prosa, sin markdown ni emojis**, y (deseable) **streaming**. Con eso las tarjetas y el render premium son directos; sin eso, la capa de sanitización (§3.2) evita el markdown crudo pero no habrá tarjetas ricas.
