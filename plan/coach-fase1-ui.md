# Coach IA — Fase 1 · Spec de UI implementable (para CTO)

**Rol:** UX/UI Lead · **Autor:** Rams Design (skm3lj3d) · **Fecha:** 2026-07-31
**Base:** `plan/coach-ui-spec.md` (visión completa), `plan/ola1-spec-diseno.md` (tokens/shell), `plan/rediseno-coach-ia.md` (motor/tonos Karpathy)
**Scope FASE 1 (solo esto):** pantalla **MI COACH** (chatbox) · acciones rápidas · selector de personalidad (**4 tonos**) · entrada por el **orbe Coach**.
**Fuera de scope (Fase 2):** notificaciones push, centro de notificaciones, chat contextual desde push.
**Stack:** Next.js 15 App Router + React 19, cliente. Móvil-first PWA. SVG para orbe/anillos. Usa los tokens ya definidos en `app/globals.css`.

---

## 0. Archivos a crear/tocar (resumen)

```
app/coach/page.js                         NUEVO  — ruta + orquestador del chat
components/coach/CoachHeader.js            NUEVO
components/coach/CoachGreeting.js          NUEVO  (usa lib/coachContext)
components/coach/QuickActions.js           NUEVO
components/coach/ChatThread.js             NUEVO  (lista de burbujas + autoscroll)
components/coach/ChatBubble.js             NUEVO
components/coach/TypingIndicator.js        NUEVO
components/coach/Composer.js               NUEVO
components/coach/MealSuggestionCard.js     NUEVO  (tarjeta accionable)
components/coach/PersonalityPicker.js      NUEVO
components/coach/CoachOrb.js               NUEVO  (avatar-orbe SVG, reutil. en TabBar)
lib/coachContext.js                        NUEVO  (arma saludo + payload de contexto)
components/TabBar.js                        EDITAR (orbe abre /coach)
app/api/coach/route.js                     NUEVO  (endpoint stream — lo hace CTO/Karpathy)
app/globals.css                             EDITAR (clases .coach-*)
components/AddMealModal.js                  REUSAR (analizar foto embebido / al registrar)
lib/usage.js                                REUSAR (límite Free 3/mes)
components/UpgradeModal.js                  REUSAR (al agotar Free)
```

---

## 1. Punto de entrada — orbe Coach (`components/TabBar.js`)

Ya especificado en `ola1-spec-diseno.md §2.2`. En Fase 1 **se activa**: al pulsar el orbe central → `router.push('/coach')` (o abre `<CoachSheet>` como overlay; recomiendo **ruta** `/coach` para deep-link futuro).
- Orbe = `<CoachOrb size={56} active />` dentro del botón central, `background: var(--brand)`, `box-shadow: var(--shadow-3)`, elevado `-12px`.
- `aria-label="Abrir tu coach"`. Respiración en reposo (§7), off con reduced-motion.

**`components/coach/CoachOrb.js`** — avatar-orbe SVG reutilizable (cabecera del chat y tab bar):
```
props: { size=40, active=false }
render: <svg> círculo con gradiente radial var(--brand)→var(--brand-strong)
        + 2 arcos concéntricos sutiles (opacity .5/.25). NO cara humana.
```

---

## 2. Pantalla MI COACH (`app/coach/page.js`)

### 2.1 Layout (3 zonas, altura completa)
```
┌───────────────────────────────┐  ← CoachHeader (sticky top, safe-area-top)
│ ‹  (orbe) Tu coach · Sereno  ⋯ │
├───────────────────────────────┤
│                               │  ← ChatThread (flex:1, scroll-y)
│  CoachGreeting (1ª burbuja)   │
│  ...burbujas...               │
│  [QuickActions cuando idle]   │
│                               │
├───────────────────────────────┤  ← Composer (sticky bottom, sube con teclado)
│ [＋]  Escribe a tu coach… [↑] │
└───────────────────────────────┘
```
Contenedor: `display:flex; flex-direction:column; height:100dvh; max-width:var(--maxw); margin:0 auto; background:var(--bg);`

### 2.2 Estado (React, en `app/coach/page.js`)
```js
const [messages, setMessages] = useState([]);      // {id, role:'user'|'coach', text, card?, streaming?}
const [status, setStatus] = useState('idle');       // 'idle'|'typing'|'streaming'
const [tone, setTone] = useState(profile.personalidad ?? 'sereno');
const [pickerOpen, setPickerOpen] = useState(false);
const [remaining, setRemaining] = useState(usage.coachRemaining); // Free: 3/mes
```
- Al montar: `messages = [greeting]` (§3.2), `QuickActions` visibles.
- `send(text)`: push burbuja user → `status='typing'` → fetch stream (§6) → `status='streaming'` va haciendo append a la última burbuja coach → `status='idle'`. Auto-scroll al fondo mientras crece.

### 2.3 CoachHeader (`components/coach/CoachHeader.js`)
```
[‹ back]  <CoachOrb 40>  "Tu coach"           [⋯]
                         "Sereno · en línea"   (subtítulo tocable → PersonalityPicker)
```
- `background:var(--surface)`, borde inferior `--border`, `padding: env(safe-area-inset-top) var(--s4) 0`.
- Nombre `text-h3`; subtítulo `text-caption var(--text-2)`, tocable (abre `PersonalityPicker`).
- `⋯` menú Fase 1: solo **Cambiar personalidad** y **Limpiar chat** (resto = Fase 2).
- `back` → `router.back()`.

---

## 3. Burbujas y saludo

### 3.1 ChatBubble (`components/coach/ChatBubble.js`)
```
props: { role, text, card, streaming }
```
- **user:** `align-self:flex-end; background:var(--brand); color:var(--brand-ink); border-radius:16px 16px 4px 16px;`
- **coach:** `align-self:flex-start; background:var(--surface-2); color:var(--text); border-radius:16px 16px 16px 4px;`
- Común: `max-width:85%; padding:var(--s3) var(--s4); font: var(--fs-body); margin-bottom:var(--s3);`
- Sin avatar por burbuja (solo en cabecera) → más limpio.
- Si `streaming`: renderiza `text` en curso + cursor `▍` con blink suave (off en reduced-motion).
- Si `card`: renderiza la tarjeta (§5) **debajo** del texto.
- Markdown ligero (negritas/listas) con un parser mínimo o `react-markdown` si ya está; evitar bloques largos.

### 3.2 CoachGreeting (`components/coach/CoachGreeting.js`)
Primera burbuja coach, generada **cliente** desde `lib/coachContext.js` (no requiere IA):
```js
// lib/coachContext.js
export function buildGreeting({ name, hour, goalKcal, goalProtein }) {
  const saludo = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  return `${saludo}${name ? ', ' + name : ''}. Hoy trabajamos por tu meta: `
       + `${goalKcal} kcal y ${goalProtein} g de proteína. ¿Por dónde empezamos?`;
}
```
- Datos desde `/api/settings` (meta) + perfil (nombre/macros). `.num` en cifras. `[REAL]` — no depende del endpoint de IA.
- Fallback sin proteína si el plan no la tiene aún.

---

## 4. Acciones rápidas (`components/coach/QuickActions.js`)

Fila horizontal scrolleable, visible cuando `status==='idle'` y el hilo está en el saludo o inactivo; se ocultan al enviar y reaparecen tras respuesta.
```
props: { onPick(actionId), hour }
```
Chips (pill, `background:var(--surface-2); border:1px var(--border); padding:10px 14px; min-height:44px; gap:8px; icon 20 + label text-sub`):

| id | label | icono | efecto |
|---|---|---|---|
| `desayuno` | ¿Qué desayuno? | sunrise | `send("¿Qué desayuno hoy?")` |
| `analizar` | Analizar comida | camera | abre `AddMealModal.js` embebido → resultado como tarjeta |
| `puedo_comer` | ¿Qué puedo comer? | utensils | `send("¿Qué puedo comer con lo que me queda?")` |
| `entreno` | Mi entrenamiento | activity | `send("¿Qué como alrededor de mi entrenamiento?")` |
| `progreso` | Mi progreso | trending-up | `send("¿Cómo voy?")` |
| `preguntar` | Preguntar… | message | foco al Composer |

- Máx 6; orden por hora (`hour<11` → `desayuno` primero). Se ven 3–4, resto por scroll. Snap horizontal, sin barra visible.
- Iconos lineales (Lucide inline SVG). Foco visible.

---

## 5. Tarjeta accionable — MealSuggestionCard (`components/coach/MealSuggestionCard.js`)

La respuesta del coach puede incluir `card` (la única de Fase 1; el resto en Fase 2). Va dentro de la burbuja coach.
```
props: { title, kcal, protein_g, carbs_g, fat_g, onRegister, onAnother }
```
- `background:var(--surface); border:1px var(--border); border-radius:var(--r-md); padding:var(--s4); margin-top:var(--s2);`
- Título `text-h3`. Fila de macros: 3 mini-chips con color de nutriente (`--protein/--carbs/--fat`) + valor `.num`. kcal destacada `.num text-h2`.
- Botones: **[Registrar]** primario (`--brand`) → `onRegister` (POST `app/api/meals`, cierra con toast + sube anillo de HOME) · **[Otra opción]** fantasma → `onAnother` (re-pregunta al coach).
- Acción en 1 tap. Sin la tarjeta, el chat sería "ChatGPT genérico"; con ella, es un coach que **actúa**.

---

## 6. Streaming y estados de carga

### 6.1 TypingIndicator (`components/coach/TypingIndicator.js`)
Burbuja coach con 3 puntos que **respiran** (no spinner):
```css
.coach-typing span { width:6px;height:6px;border-radius:50%;background:var(--text-3);
  display:inline-block;margin:0 2px;animation:coachDot 1.2s infinite ease-in-out; }
.coach-typing span:nth-child(2){animation-delay:.15s}
.coach-typing span:nth-child(3){animation-delay:.3s}
@keyframes coachDot{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
@media (prefers-reduced-motion:reduce){.coach-typing span{animation:none;opacity:.6}}
```
- Se muestra mientras `status==='typing'` (antes del primer token).

### 6.2 Streaming token a token
- Endpoint `POST /api/coach/route.js` responde **stream** (SSE o `ReadableStream`). Cliente lee con `fetch` + `response.body.getReader()`; por cada chunk hace `setMessages(append a la última burbuja coach)` y `status='streaming'`.
- Auto-scroll: si el usuario está cerca del fondo, seguir pegado; si scrolleó arriba, no forzar (patrón ChatGPT).
- Al cerrar el stream: si el payload traía `card`, adjuntarla a la burbuja; `status='idle'`.
- **El endpoint lo implementa CTO/Karpathy** (contexto + tono + guardrails). UI solo consume texto + `card?` opcional al final.

---

## 7. Composer (`components/coach/Composer.js`)
```
[＋]  <textarea auto-crece>  [↑ enviar]
```
- `position:sticky; bottom:0; background:var(--surface); border-top:1px var(--border); padding:var(--s2) var(--s3) calc(var(--s2) + env(safe-area-inset-bottom));`
- `＋` → hoja: **Foto / Galería / Registro manual** (reusa el input file de `AddMealModal.js`/`app/page.js`). Voz **oculto en Fase 1**.
- `textarea`: `background:var(--surface-2); border-radius:var(--r-lg); padding:10px 12px; min-height:44px; max 4 líneas; inputmode text;` placeholder "Escribe a tu coach…".
- `↑` enviar: `--brand`, activo solo con texto no vacío; Enter envía, Shift+Enter salto de línea.
- Sube con el teclado (usar `dvh` + `interactionWidget`/`visualViewport` si hace falta).
- **Free (Drucker):** sobre el composer, línea discreta `text-caption var(--text-3)`: "Te quedan N preguntas gratis". Al llegar a 0 → al enviar, burbuja-teaser del coach + abrir `UpgradeModal.js` (no cortar a media respuesta).

---

## 8. Selector de personalidad (`components/coach/PersonalityPicker.js`)

Hoja modal (sheet desde abajo). **4 tonos** (Fase 1). Abre desde subtítulo de cabecera o `⋯`.
```
props: { value, onChange(tone), isPro }
```
### 8.1 Los 4 tonos y su preview (misma frase: "te faltan 25 g de proteína")
```js
const TONES = [
  { id:'amigable',  name:'Amigable',   preview:'¡Casi lo tienes! Solo 25 g de proteína; unos huevos con la cena y cierras un gran día.' },
  { id:'entrenador',name:'Entrenador', preview:'Te faltan 25 g y no los vas a dejar hoy. Pechuga o huevos, tú eliges — pero se cierran.' },
  { id:'analitico', name:'Analítico',  preview:'Proteína: 115/140 g (82%). +25 g = 130 g de pechuga → 100% y racha 11 días.' },
  { id:'tranquilo', name:'Tranquilo',  preview:'Vas bien. Si te apetece, unos 25 g de proteína redondean el día; si no, mañana seguimos.' },
];
```
(Textos de Karpathy A2; `tranquilo` = default.)

### 8.2 Layout
```
┌ ¿Cómo quieres que te hable tu coach? ┐
│  ┌────────────────────────────────┐  │  ← PREVIEW EN VIVO (burbuja coach)
│  │ (tono seleccionado) preview…   │  │     se reescribe al cambiar selección
│  └────────────────────────────────┘  │
│  ( Amigable )  ( Entrenador )         │  ← chips radio, 2×2
│  ( Analítico ) ( Tranquilo ✓ )        │
│  [ Usar este tono ]                    │
└───────────────────────────────────────┘
```
- Seleccionar un chip **reescribe la burbuja de preview** con su `preview` (feedback inmediato — el WOW de "hacerlo suyo").
- Chip seleccionado: borde `--brand`, fondo `--brand-tint`. Target ≥44px.
- **[Usar este tono]** → `onChange(tone)` → `PUT` perfil (`personalidad`) → cierra + toast "Tu coach ahora te habla distinto". **No borra el hilo.**
- **Free/Pro (Drucker):** Fase 1 puede habilitar los 4 en Free para probar afinidad, **o** dejar `tranquilo`+`amigable` Free y `entrenador`+`analitico` con chip "Pro" (candado → `UpgradeModal.js`). **Recomendación: los 4 gratis en Fase 1** (afinidad temprana = retención); mover a Pro después si el costo lo pide. Confirmar con Drucker.
- El tono viaja al endpoint (§6) como campo `tone`; **modula solo el copy**, nunca cálculos ni guardrails.

---

## 9. Clases CSS a añadir (`app/globals.css`)
`.coach-screen`, `.coach-header`, `.coach-thread`, `.coach-bubble.user/.coach`, `.coach-typing`, `.coach-quick`, `.coach-chip`, `.coach-composer`, `.coach-card`, `.tone-preview`, `.tone-chip`. Todas usando los tokens existentes (colores, radios, sombras, espaciado). Foco visible global ya cubierto por la regla `:focus-visible` de `ola1-spec-diseno.md §8`.

---

## 10. Accesibilidad (Fase 1)
- Hilo: `role="log" aria-live="polite"` para anunciar respuestas del coach de forma educada (no interrumpir mientras streamea; anunciar al cerrar).
- Burbujas: contraste ya AA (tokens). Composer textarea con `aria-label="Mensaje para tu coach"`.
- PersonalityPicker: `role="radiogroup"`, chips `role="radio" aria-checked`.
- Orbe/botones: `aria-label`. Targets ≥44px. Reduced-motion respetado (respiración, puntos, cursor).

---

## 11. Orden de implementación (Fase 1)
1. `CoachOrb` + activar orbe en `TabBar.js` → ruta `/coach` vacía.
2. Layout `app/coach/page.js` + `CoachHeader` + `CoachGreeting` (sin IA, datos de settings). **Ya se ve y se siente el coach.**
3. `Composer` + `ChatThread` + `ChatBubble` con **eco local** (mock) para validar UX.
4. Cablear `POST /api/coach` con **streaming** + `TypingIndicator` (endpoint de CTO/Karpathy).
5. `QuickActions`.
6. `MealSuggestionCard` + [Registrar] (POST `app/api/meals`).
7. `PersonalityPicker` (4 tonos, preview) + persistir `personalidad`.
8. Límite Free (`lib/usage.js`) + teaser `UpgradeModal.js`.

**Bloqueante único:** endpoint `POST /api/coach` con streaming, contexto del usuario y `tone` (CTO + Karpathy). Todo lo demás (pasos 1–3, 5–8) es UI construible en paralelo; el saludo y el layout no dependen de IA y son la rebanada visible más temprana.
