# Sistema de Diseño — Compañero de Salud con IA (móvil-first, PWA)

**Rol:** UX/UI Lead · dueño del sistema de diseño · **Autor:** Rams Design (skm3lj3d)
**Fecha:** 2026-07-28 · **Estado:** Sistema de diseño + inventario de pantallas (no UI final de código)
**Construye sobre:** `plan/premium-vision-ux.md` (mi visión previa)
**Realiza la visión de:** Jony Ive (estrella polar creativa — "coach sereno tipo Oura, no MyFitnessPal")
**Alineado con datos de:** Karpathy (`plan/premium-vision-nutricion-ia.md`) · Producto de: Drucker (`plan/premium-vision-producto.md`)

> **Etiquetas de datos por widget:** `[REAL]` ya existe · `[INPUT]` lo captura el usuario · `[IA]` lo genera visión/coach · `[V2/V3]` ola posterior · `[?]` pendiente confirmar. Cada pantalla mapea a fuentes reales del motor de Karpathy y al corte Free/Pro de Drucker.

---

## 0. Estrella polar y principios (el "sentimiento")

**La app debe sentirse: serena, personal, y en control.** No es una hoja de cálculo que te juzga; es un compañero que te acompaña. Tres principios rectores heredados y ratificados:

1. **Conversación sobre contabilidad.** El HOME saluda y orienta ("¿qué necesitas hoy?") antes de mostrar cifras. El dato es soporte, el acompañamiento es protagonista. (Headspace + ChatGPT).
2. **Calma y foco — una cosa importa por pantalla.** Espacio en blanco generoso, jerarquía clara, nunca saturación. (Oura + Apple Health + Linear).
3. **Hábito, nunca castigo.** Gamificación y copys celebran consistencia y conducta sana; jamás premian restricción ni rompen rachas por "pasarse" (regla dura de Drucker §5 y Karpathy). La marca es **salud sostenible, no culpa**.

Disciplina visual (Stripe/Notion/Linear): tipografía impecable con números tabulares, elevación sutil por sombra suave, bordes de 1px de bajo contraste, movimiento con propósito y nunca decorativo.

---

## 1. ARQUITECTURA DE NAVEGACIÓN

### 1.1 Tab bar inferior (móvil-first, 4 destinos + Coach permanente)
Barra fija inferior, 4 pestañas de igual peso, con el **botón Coach IA permanente flotando al centro** (patrón "docked FAB" tipo tab bar con acción central elevada):

```
┌───────────────────────────────────────────────┐
│                                                │
│                 CONTENIDO                      │
│                                                │
├──────────┬──────────┬────┬──────────┬──────────┤
│  Home    │ Progreso │ ◎  │  Plan    │  Perfil  │
│  (casa)  │ (gráfica)│Coach│ (comida) │ (avatar) │
└──────────┴──────────┴────┴──────────┴──────────┘
                        ▲
             Botón Coach IA PERMANENTE
        (orbe sereno, elevado, siempre visible)
```

| Pestaña | Contenido | Nota |
|---|---|---|
| **Home** | Home conversacional (§3.1): saludo, qué necesitas hoy, progreso del día, mensaje del coach | destino por defecto |
| **Progreso** | Dashboard: tendencias, adherencia, peso/medidas, gamificación resumida | Pro amplía histórico |
| **◎ Coach IA** | **Botón central permanente** → abre chat (§3.2). Orbe sereno, elevado, siempre accesible desde cualquier pestaña | acción estrella |
| **Plan** | Plan de comida dinámico (§3.5) + registro | `[V2]` según Drucker (Ola 2/4) |
| **Perfil** | Objetivos, coach especializado, ajustes, suscripción, condición médica | |

- **Registrar comida** (la acción de alta frecuencia) vive como **FAB contextual dentro de Home** (cámara/texto/voz) — no ocupa un slot de tab, porque el Coach ocupa el centro. En scroll de Home, el FAB de registro se mantiene accesible.
- **Coach IA permanente:** es el diferenciador #1 (Drucker: "el foso #2"). Por eso tiene el lugar más alcanzable (pulgar, centro). Al tocarlo emerge el chat como **hoja modal** (no navegación destructiva) para no perder contexto de dónde estabas.

### 1.2 Mapa de navegación (jerarquía)
```
Onboarding (fuera de tabs) → Home
Home ─ FAB registro → [Cámara | Texto | Voz] → Confirmar → Home
     └ Mensaje del coach → abre Coach IA con ese tema precargado
Progreso ─ tap widget → detalle (peso, adherencia, micros, logros)
Coach IA (modal desde cualquier lugar) ─ selección de coach especializado
Plan ─ generar/editar plan → registrar comida del plan
Perfil ─ Objetivos | Coach especializado | Suscripción/Paywall | Condición médica | Ajustes (tema, notif AM/PM)
```

---

## 2. TOKENS DEL SISTEMA

Base heredada del CSS actual (`app/globals.css`: `--page #f9f9f7`, tarjetas, acento azul) evolucionada a un sistema completo con dark mode. Todo en CSS custom properties para theming por `data-theme`.

### 2.1 Color — escala semántica (light / dark)
```
/* Superficies */
--bg            #FBFBF9  /  #0C0D0F   (fondo app)
--surface       #FFFFFF  /  #16181C   (tarjetas)
--surface-2     #F4F4F1  /  #1E2126   (tarjetas anidadas, chips)
--border        rgba(0,0,0,.08) / rgba(255,255,255,.10)
--overlay       rgba(12,13,15,.45) / rgba(0,0,0,.6)

/* Texto (contrastes verificados WCAG-AA ≥4.5:1 sobre surface) */
--text          #14161A  /  #F2F3F5   (títulos/cifras)
--text-2        #52555C  /  #A9AEB8   (secundario)
--text-3        #6B6F77  /  #7C828C   (muted — mínimo AA en 13px+; nunca <12px sobre surface)

/* Marca — acento propio (reemplaza el azul genérico) */
--brand         #0E7C6B  /  #2BC4AC   (verde-teal sereno = salud + calma, no "app de dieta")
--brand-strong  #0A5F52  /  #4FD8C2
--brand-tint    #E3F3F0  /  rgba(43,196,172,.14)

/* Nutrientes (consistentes en TODA la app: anillos, barras, chips) */
--protein       #E4572E   (naranja tierra)
--carbs         #F2A93B   (ámbar)
--fat           #6C7BF2   (índigo suave)
--fiber         #7BAE4B   (verde)
--water         #3BA9F2   (azul agua)

/* Estados */
--ok      #1E874B  --ok-tint      #E4F3EA
--warn    #C98A16  --warn-tint    #FBF0D6
--over    #C64545  --over-tint    #F7DFDF
--info    var(--brand)
```
Regla: **el color de macro/nutriente es el mismo en cada pantalla** (anillo de Home = barra de dashboard = chip del plan). Consistencia cromática = legibilidad sin leyenda.

### 2.2 Tipografía
```
--font-sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-num:  "Inter", ui-sans-serif;  font-variant-numeric: tabular-nums;  /* TODA cifra */

Escala (rem, 1rem=16px):    Pesos: 400 / 500 / 600 / 700
--fs-display 44/48  700   (hero de kcal, revelación del plan)
--fs-h1      28/34  700
--fs-h2      22/28  600
--fs-h3      17/24  600
--fs-body    15/22  400   (base)
--fs-sub     13/18  500
--fs-caption 12/16  500   (labels; nunca color muted por debajo de AA)
```
Números SIEMPRE tabulares (kcal, macros, peso, XP, horas) para que no "bailen" al actualizarse.

### 2.3 Espaciado, radios, elevación, motion
```
--space: 4·escala → 4 8 12 16 20 24 32 40 48   (grid base 4px)
--radius: sm 8 · md 12 · lg 16 · xl 20 · pill 999
--shadow-1: 0 1px 2px rgba(12,13,15,.06)              (tarjeta en reposo)
--shadow-2: 0 4px 16px rgba(12,13,15,.10)             (FAB, hoja, popover)
--shadow-focus: 0 0 0 3px var(--brand-tint)           (foco visible)
--dur: fast 120ms · base 200ms · slow 360ms · ring 700ms
--ease: standard cubic-bezier(.2,.0,0,1) · spring cubic-bezier(.34,1.56,.64,1)
--touch-min: 44px   (target táctil mínimo AA)
--safe: env(safe-area-inset-*)   (PWA notch/home indicator)
```

### 2.4 Iconografía
- Set único **lineal 1.5–2px, esquinas redondeadas** (estilo Lucide/SF Symbols). **Adiós a los emojis** como UI (🍽️📷🗑✨) — se ven inconsistentes y no premium.
- Tamaños: 20 (inline), 24 (tab bar/acciones), 28 (destacados). `currentColor` para heredar tema.
- Iconos clave: casa, gráfica-anillo, orbe-coach, plato, avatar, cámara, micrófono, teclado, llama (racha), medalla, gota (agua), balanza, candado (Pro).

---

## 3. INVENTARIO DE PANTALLAS (wireframes descritos)

### 3.1 HOME conversacional (pestaña Home) — la pantalla más importante
No es "pantalla de calorías": es el saludo diario del coach. Orden vertical (scroll):

```
┌─ Saludo contextual ──────────────────────────────┐
│  "Buenos días, Emiliano ☀"      [avatar/nivel]   │  [IA/REAL hora+nombre]
│  1 línea del coach según hora/estado             │  [IA insight §3.2]
├─ ¿Qué necesitas hoy? (fila de intents) ──────────┤
│  [Registrar]  [Pregúntale al coach]  [Ver plan]  │  chips de acción rápida
├─ PROGRESO DEL DÍA (héroe) ───────────────────────┤
│         ◜◝  anillo kcal + 3 mini-anillos macro    │  [REAL]
│      1 360 / 2 000 kcal · "Te quedan 640"        │
│      P 82/140 · C 120/180 · G 40/60              │
├─ Mensaje del coach (tarjeta) ────────────────────┤
│  💬 "Vas bien. Te falta proteína: una cena con   │  [IA] Pro; Free = teaser
│     pollo o frijol cierra tu día." → [Pregúntale]│
├─ Comidas de hoy (timeline compacto) ─────────────┤
│  Desayuno 08:10 · 420 kcal · [miniatura]         │  [REAL]
│  + Registrar comida                              │
├─ Racha + reto activo (resumen gamificación) ─────┤
│  🔥 7 días · Reto: "Proteína 5/7"  ▓▓▓▓░░░       │  [REAL/V2]
└──────────────────────────────────────────────────┘
```
- **Saludo + mensaje del coach arriba de las cifras** = realiza la visión de Ive (conversacional). El anillo de progreso es el héroe visual pero enmarcado por lenguaje humano.
- **Estado vacío (día nuevo):** el coach propone la primera acción ("Empecemos con tu desayuno — tómale una foto"). Nunca un cero mudo.
- FAB **Registrar** (cámara/texto/voz) siempre accesible.

### 3.2 COACH IA — chat (hoja modal desde el botón permanente)
Estilo ChatGPT, sereno (Headspace):
```
┌─ Coach [nombre/persona] ▾   selección de coach → │  ✕
├──────────────────────────────────────────────────┤
│  (coach) "Hola, ¿en qué te ayudo con tu comida?" │  burbuja izquierda
│                       "¿Qué ceno hoy?" (usuario) │  burbuja derecha (brand)
│  (coach) streaming… "Con tu meta, te propongo…"  │  [IA streaming]
│          → tarjeta-sugerencia: Pollo + arroz     │  card accionable
│            520 kcal · P40 C55 G12  [Registrar]   │  1 tap para registrar
├─ Sugerencias rápidas (chips) ────────────────────┤
│  [¿Voy bien?] [¿Qué ceno?] [¿Es sano esto?]      │
├─ input ──────────────────────────────────────────┤
│  [＋foto] [texto………………] [🎙]        [enviar] │
└──────────────────────────────────────────────────┘
```
- **Respuestas ancladas a datos del usuario** (Karpathy §3.2): el coach ve `macros_pendientes_hoy`, tendencia, objetivo. Cada respuesta ofrece **acción en 1 tap** (Registrar / Replanear).
- **Streaming** con burbuja "escribiendo" serena (3 puntos con fade, no spinner agresivo).
- **Disclaimers médicos** (Karpathy §5) aparecen como nota discreta bajo la burbuja cuando el tema toca una condición, no como popup invasivo.
- **Free = 3 preguntas/mes** (Drucker): al agotar, degradar con teaser + CTA upgrade (no bloqueo brusco a media conversación).

### 3.3 SELECCIÓN DE COACH ESPECIALIZADO
`[?Karpathy: ¿personas distintas o capa UI sobre un motor?]` — diseño soporta ambas.
```
┌─ Elige a tu coach ───────────────────────────────┐
│  Cada uno ajusta su tono y enfoque a tu objetivo │
│  ┌────────┐ ┌────────┐ ┌────────┐                │
│  │ 🟢 Salud│ │ 💪Fuerza│ │🔥Grasa │ …             │  tarjetas-persona
│  │ sereno │ │ directo│ │motivad.│                │
│  └────────┘ └────────┘ └────────┘                │
│  ┌────────┐ ┌────────┐                            │
│  │🏃Resist.│ │⚕Médico │ (conservador, disclaimer) │
│  └────────┘ └────────┘                            │
└──────────────────────────────────────────────────┘
```
Cambia avatar/tono del coach en el chat; el motor de cálculo es el mismo (según confirme Karpathy). El coach "Médico" activa modo conservador (Karpathy §5).

### 3.4 ONBOARDING INTELIGENTE (fuera de tabs)
Realiza `plan/premium-vision-ux.md` §1 mapeado a la taxonomía de Karpathy §1 y variables §2.1. 6 pasos, ramificado, con defaults:
```
1 Bienvenida + valor ("coach en español que entiende tu comida")
2 ¿Qué buscas?  → 6 categorías (A Salud · B Composición · C Rendimiento ·
                  D Fuerza · E Dieta · F Médica) → sub-objetivos (chips)
                  → objetivo PRIMARIO (Karpathy: 1 primario + hasta 2 sec.)
3 Datos base (una vez): sexo, edad, peso, altura, actividad(PAL 5 niveles)
4 Parámetros por objetivo (solo los elegidos) + patrón dieta + intolerancias/alergias
  → si F médica: pantalla de CONSENTIMIENTO explícito (Karpathy §5.2, con fecha)
5 "Calculando tu plan…" (anillos llenándose, 2-3s, respeta reduced-motion)
6 REVELACIÓN DEL PLAN (momento "ajá"): kcal objetivo + 3 anillos de macros
  (Mifflin-St Jeor/Katch, Karpathy §2.2) + fibra/hidratación + chips de objetivos
  → CTA "Registrar mi primera comida"
```
- **Anti-abrumo:** categorías→items, ramificación, un campo por pantalla, sliders con default, barra de progreso 1–6, saltable ("explorar primero" → plan de salud general editable).
- **Muro DESPUÉS de la revelación** (mi recomendación, alineada con activación): el usuario ve su plan gratis; el paywall llega al activar features Pro.

### 3.5 PLAN DE COMIDA DINÁMICO (pestaña Plan) `[V2 — Drucker Ola 2/4]`
```
┌─ Tu plan de hoy · 1 850 kcal restantes ──────────┐
│  Desayuno  ✔ registrado  420 kcal                │
│  Comida    ○ sugerido: Tinga de pollo            │  [IA plan Karpathy §3.4]
│            620 kcal · P45 C60 G20                 │
│            [Registrar] [Cambiar] [No me gusta]    │
│  Cena      ○ sugerido: …                          │
│  Snack     ○ …                                    │
├─ al cambiar una comida ──────────────────────────┤
│  se recalculan SOLO los macros restantes         │  (ahorra tokens, Karpathy)
└──────────────────────────────────────────────────┘
```
Respeta filtros duros (alergia/veganismo — validados en código, Karpathy §3.3). Cada opción trae kcal/macros/costo/tiempo. "Cambiar" regenera solo esa comida.

### 3.6 DASHBOARD / PROGRESO (pestaña Progreso)
Jerarquía "¿voy bien?" primero (de `premium-vision-ux.md` §2.1):
```
1 Adherencia semanal (anillo % días en meta)          [REAL derivable]
2 Tendencia peso (media móvil 7d vs ritmo objetivo)   [INPUT peso]  Karpathy §2.2
3 Tendencia kcal semana/mes (toggle)                  [REAL 7d]/[V2 mes]
4 Macros promedio + fibra + hidratación               [REAL/INPUT/IA]
5 Micronutrientes del objetivo                        [?Karpathy]/[V3]
6 Peso y medidas (evolución)                          [INPUT]
7 Reporte semanal de insights (tarjeta)               [IA] Pro (Drucker)
```
Cada widget Pro bloqueado = **teaser difuminado + candado + CTA** (patrón §4). Widgets sin dato aún = **estado vacío accionable** ("Registra tu peso para ver tu tendencia").

### 3.7 GAMIFICACIÓN
Ligada a hábito sano (Drucker §5, Karpathy). Resumen en Home; detalle en pestaña Progreso:
```
┌─ Tu progreso de hábito ──────────────────────────┐
│  Nivel 4 · Constante   XP ▓▓▓▓▓▓▓░░ 720/1000     │  sube por semanas activas
│  🔥 Racha 7 días (1 comodín disponible)           │  protección de racha
│  Reto del mes: "Semana de la proteína" ▓▓▓░░     │
│  Insignias:  ●●●○○○ (galería, bloqueadas en gris) │
└──────────────────────────────────────────────────┘
```
- **Anti-patrones prohibidos** (regla dura): nada de romper racha por "pasarse", badges por "menos calorías", ni rankings de peso. Se premia registrar/balancear/sostener.
- **Celebraciones:** subir de nivel / cerrar racha → confetti breve + toast (respeta reduced-motion).

### 3.8 FEEDBACK DIARIO AM / PM `[IA — ?Karpathy frecuencia]`
Dos micro-momentos de acompañamiento (Headspace), vía notificación push (PWA) → abren tarjeta en Home:
```
AM (mañana):  "Buenos días. Hoy tu meta es 2 000 kcal y 140g de proteína.
               ¿Empezamos con el desayuno?"  → [Registrar] [Ver plan]
PM (noche):   "Cierre del día: 1 890 kcal ✔, proteína 128/140.
               Mañana intenta un desayuno con huevo. 🔥 racha 8."  → [Ver resumen]
```
- Tono cálido, 1-2 líneas, siempre con **una acción**. Configurable (hora/activar) en Perfil. Nunca culpabiliza si el usuario no cumplió: reencuadra en positivo.

---

## 4. LIBRERÍA DE COMPONENTES (reutilizables)

| Componente | Uso | Estados / notas |
|---|---|---|
| **AppShell + TabBar** | marco global, 4 tabs + Coach central | safe-area, activo/inactivo, badge |
| **CoachButton (orbe)** | botón permanente central | reposo (respiración sutil), press, con-notificación |
| **ProgressRing** | anillo kcal y macros (SVG, como `WeekChart.js`) | animado 0→valor, colores de §2.1, aria-valuenow |
| **MacroBar / MacroChip** | macros en listas y cards | color por nutriente consistente |
| **StatCard / MetricTile** | métricas del dashboard | normal · vacío-accionable · bloqueado-Pro |
| **CoachMessageCard** | mensaje/insight del coach en Home | Pro real · Free teaser |
| **ChatBubble + SuggestionCard** | chat del coach | usuario/coach, streaming, card con [Registrar] |
| **MealItem / MealTimeline** | comidas del día y plan | registrado/sugerido, swipe-to-delete (target ≥44) |
| **LogSheet** | hoja de registro | tabs Cámara/Texto/Voz → resultado editable |
| **RingReveal** | revelación del plan (onboarding) | animación de llenado |
| **StreakBadge / LevelBar / BadgeGrid / ChallengeCard** | gamificación | bloqueado(gris)→desbloqueado(color) |
| **PaywallSheet / LockedOverlay** | muro Pro | teaser difuminado + candado + CTA (base `UpgradeModal.js`) |
| **Toast / ConfettiBurst** | feedback | éxito/error/celebración, reduced-motion |
| **Skeleton** | carga | shimmer suave, nunca spinner solo |
| **EmptyState** | vacíos | icono + copy + CTA (nunca cero mudo) |
| **Sheet / Modal / Segmented / Slider / Stepper / Chip / Button** | primitivos | variantes primary/ghost/danger, foco visible |
| **Disclaimer / MedicalBanner** | condición médica | persistente, no invasivo (Karpathy §5) |

Principio: **una fuente de verdad por primitivo**; el color de nutriente, radios y sombras vienen siempre de tokens, nunca hardcodeados.

---

## 5. MICROINTERACCIONES, ANIMACIÓN Y FEEDBACK

- **Anillos:** al registrar, el anillo del día se llena con transición `slow` + `ease-spring`; el número cuenta hacia arriba (tabular). Es el feedback central de "avancé".
- **Registro guardado:** toast "Guardado ✔" + el anillo sube + haptic sutil (PWA vibrate). Confirmación clara sin interrumpir.
- **Coach escribiendo:** tres puntos con fade suave (no spinner). Streaming token a token (ChatGPT).
- **Coach button:** "respiración" muy sutil en reposo (scale 1→1.02, 4s) que transmite presencia serena; se detiene con reduced-motion.
- **Celebración (nivel/racha):** confetti breve (≤1.2s) + toast; una sola vez, no repetitivo.
- **Transiciones de pantalla:** push/hoja con `ease-standard` 200ms; el Coach entra como sheet desde abajo (no reemplaza la pantalla → mantiene contexto).
- **Estados de carga:** skeletons con shimmer para dashboard/plan; el "Calculando tu plan" del onboarding convierte la espera en valor percibido.
- **Errores:** inline con acción de **Reintentar** (nunca callejón sin salida). El de "no es comida" se maneja antes/junto a la captura.
- **Regla transversal:** todo movimiento respeta `prefers-reduced-motion` (sustituye por fundido simple); nada de animación puramente decorativa.

---

## 6. ACCESIBILIDAD (WCAG-AA) Y DARK MODE

- **Contraste:** todos los pares texto/fondo verificados ≥4.5:1 (texto normal) y ≥3:1 (texto grande/iconos). `--text-3` solo en ≥13px. Los colores de nutriente llevan **etiqueta/valor**, nunca solo color (daltonismo).
- **Foco visible:** `:focus-visible` con `--shadow-focus` en todo interactivo (hoy ausente en el CSS).
- **Targets táctiles:** ≥44×44px (corrige `icon-btn`/borrar actuales).
- **Semántica/ARIA:** anillos con `role="meter"`/`img` + `aria-valuenow` (ya parcial en `DailySummary.js`/`WeekChart.js`); chat con roles de lista/log y anuncios de streaming (aria-live educado); gráficas usables en **touch**, no solo hover.
- **Tipografía escalable:** rem + soporte a Dynamic Type / zoom hasta 200% sin romper layout.
- **Movimiento:** `prefers-reduced-motion` respetado globalmente.
- **Dark mode:** `prefers-color-scheme` + toggle manual en Perfil (`data-theme`), con la escala dual de §2.1. Dark es de primera clase (Oura/Whoop son dark-first), no un afterthought.
- **PWA:** `manifest`, íconos, `theme-color` por tema, `safe-area-inset`, offline shell básico (Home cacheado). Feedback háptico donde el dispositivo lo permita.

---

## 7. COHERENCIA TÉCNICA Y HANDOFF

- Todo sobre **Next.js 15 + React 19** actual; anillos/gráficas como **SVG** (patrón ya en `components/WeekChart.js`). No introducir librerías de UI pesadas sin necesidad; los tokens viven en `app/globals.css` como custom properties.
- Reutilizar lo existente: `UpgradeModal.js` → PaywallSheet; `AddMealModal.js` → LogSheet (+ texto/voz); `DailySummary.js` → ProgressRing/StatCard; `WeekChart.js` → base de tendencias.
- **Mapa a datos (Karpathy):** cada widget etiquetado `[REAL/INPUT/IA/V2]`; los `[?]` quedan como estado-vacío-accionable hasta que confirme endpoints (home insight, chat streaming, coach especializado, plan dinámico, feedback AM/PM).
- **Mapa a producto (Drucker):** Coach y reporte semanal = Pro; gamificación = gratis; Free coach 3/mes y foto 10/mes con teaser. El Coach permanente en el centro refleja que es el foso del producto.

### Secuencia de entrega recomendada (alineada con olas de Drucker)
1. **Tokens + AppShell + TabBar + Home conversacional + ProgressRing** (base visible del sistema).
2. **LogSheet (cámara→texto/voz) + registro con feedback de anillo.**
3. **Coach IA (chat + botón permanente) + selección de coach.**
4. **Onboarding inteligente + revelación del plan.**
5. **Dashboard/Progreso + gamificación + paywall con teasers.**
6. **Plan dinámico + feedback AM/PM** (Ola 2+).

---

## 8. Pendientes de coordinación
- **Jony Ive (estrella polar):** validar sentimiento (§0), home conversacional sobre cifras (§3.1), Coach como orbe permanente central (§1.1), y cualquier "NO rotundo". Pregunta enviada.
- **Karpathy (datos):** confirmar los `[?]` — insight de home, endpoint de chat con streaming, si "coach especializado" son personas o capa UI, plan dinámico, y datos de feedback AM/PM. Pregunta enviada.
- **Drucker (producto):** corte Free/Pro ya integrado (`premium-vision-producto.md`); confirmar solo la posición del muro post-revelación.
