# Coach IA — Spec de UI (chat, notificaciones, personalidad)

**Rol:** UX/UI Lead · **Autor:** Rams Design (skm3lj3d) · **Fecha:** 2026-07-31
**Coherente con:** `plan/rediseno-sistema-diseno.md`, `plan/ola1-spec-diseno.md` (tokens/shell), `plan/rediseno-vision-experiencia.md` (alma)
**Datos/motor:** Karpathy `plan/rediseno-coach-ia.md` (objeto de contexto, 5 tonos, guardrails §7, feedback AM/PM)
**Norte:** premium, limpio, humano — **como ChatGPT pero para nutrición**. Nunca chatbot genérico de botones, nunca médico frío. Móvil-first PWA.

**Reglas anti-saturación (aplican a TODO el doc):**
- Un color de acento (`--brand` verde-teal) + neutros. Los colores de nutriente solo aparecen en datos, no en el chrome del chat.
- Superficies limpias, mucho aire, tipografía Inter. La calidez viene del **copy y el ritmo**, no de stickers ni gradientes chillones.
- Cero emojis como UI estructural (sí, con medida, dentro del texto del coach). Iconos lineales.

---

## 1. MI COACH — chatbox (`app/coach/page.js` + hoja desde el orbe)

Se abre desde el **orbe Coach permanente** (tab bar, `ola1-spec-diseno.md §2.2`) como hoja modal a pantalla casi completa, o como ruta propia. Layout de 3 zonas: **cabecera → hilo → compositor**.

### 1.1 Cabecera del coach (`components/coach/CoachHeader.js`)
```
┌─────────────────────────────────────────────┐
│ ‹   [avatar 40]  Tu coach · Sereno      ⋯    │
│                  en línea                     │
└─────────────────────────────────────────────┘
```
- **Avatar:** no una foto humana (evita "médico" y valle inquietante). Marca abstracta serena — anillo/orbe con gradiente sutil de `--brand`→`--brand-strong`. Reutiliza el lenguaje del orbe de la tab bar (coherencia).
- Nombre del coach + **tono activo** (`Sereno`/`Amigable`/…) como subtítulo tocable → abre selector de personalidad (§4).
- `⋯` → menú: cambiar personalidad, especialista, limpiar chat, notificaciones.
- Altura compacta, `--surface`, borde inferior `--border`, safe-area-top.

### 1.2 Saludo contextual (primer mensaje, `components/coach/CoachGreeting.js`)
Burbuja del coach al abrir, **anclada a datos** (objeto de contexto de Karpathy):
> *"Buenos días, Emiliano. Hoy trabajamos por tu meta: 2 200 kcal y 150 g de proteína. ¿Por dónde empezamos?"*
- Hora → saludo (misma lógica que `GreetingHeader` de HOME). Meta/macros desde el plan del usuario (`.num` tabular).
- Fallback si el motor no responde aún: saludo + meta desde settings (`[REAL]`), sin insight (`[IA→Karpathy]`).

### 1.3 Acciones rápidas (`components/coach/QuickActions.js`)
**No** son un menú de chatbot: son **sugerencias de arranque** que desaparecen al escribir y se re-muestran cuando el hilo está inactivo. Fila horizontal scrolleable de chips (pill, `--surface-2`, borde `--border`, icono lineal + label, target ≥44px):

| Chip | Acción | Mapea a |
|---|---|---|
| ¿Qué desayuno? | prompt "¿qué desayuno?" con contexto | chat |
| Analizar comida | abre cámara/registro dentro del chat | `AddMealModal.js` |
| ¿Qué puedo comer? | prompt macros_pendientes | chat |
| Mi entrenamiento | prompt entreno de hoy | chat |
| Mi progreso | resumen de tendencias → tarjeta | chat + `PlanDiff`/tarjeta |
| Preguntar… | foco al compositor (texto libre) | input |

Máx 6 chips, orden por relevancia horaria (mañana → "¿qué desayuno?" primero). No saturar: se ven 3–4, el resto por scroll.

### 1.4 Burbujas del hilo (`components/coach/ChatBubble.js`)
- **Usuario:** alineado derecha, `background: var(--brand)`, texto `--brand-ink`, `border-radius: 16px 16px 4px 16px`.
- **Coach:** alineado izquierda, `background: var(--surface-2)`, texto `--text`, `radius: 16px 16px 16px 4px`. Sin avatar repetido en cada burbuja (solo en la cabecera) → más limpio, menos "chatbot".
- Ancho máx 85%, `padding: var(--s3) var(--s4)`, `text-body`. Espaciado entre turnos `--s3`.
- Markdown ligero (negritas, listas cortas) permitido; sin bloques enormes.

### 1.5 Tarjetas dentro de la burbuja (`components/coach/*Card.js`)
El coach responde con **tarjetas accionables**, no solo texto (esto lo distingue de ChatGPT genérico):
- **MealSuggestionCard:** título + kcal/macros (colores de nutriente) + [Registrar] [Otra opción]. "Registrar" cierra el día en 1 tap (reusa POST de `app/api/meals`).
- **FoodAnalysisCard:** miniatura + resultado editable (reusa `AddMealModal.js` en modo embebido) → [Guardar].
- **ProgressCard:** mini-anillo o sparkline (reusa `ProgressRing`/`WeekChart.js`) + 1 línea de veredicto.
- **PlanCard:** comidas del día con checks (V2).
- Todas: `--surface`, borde `--border`, `radius --r-md`, botones primario `--brand` / fantasma. Acción en 1 tap, siempre.

### 1.6 Estados de carga elegantes (`components/coach/TypingIndicator.js`)
- **"Escribiendo":** tres puntos con fade secuencial (opacity 0.3↔1, 1.2s), en burbuja de coach. **No** spinner.
- **Streaming:** texto aparece token a token (append), con cursor suave; auto-scroll al fondo mientras crece.
- Si la tarjeta tarda: **skeleton** de la tarjeta (shimmer) dentro de la burbuja.
- Reduced-motion: puntos estáticos → texto directo, sin shimmer.

### 1.7 Compositor (`components/coach/Composer.js`)
```
┌─────────────────────────────────────────────┐
│ [＋]  Escribe a tu coach…            [🎙][↑] │
└─────────────────────────────────────────────┘
```
- `＋` → hoja: Foto / Galería / Registro manual. `🎙` voz (V2, ocultar si no hay soporte). `↑` enviar (activo solo con texto), `--brand`.
- Input auto-crece (1→4 líneas), `--surface-2`, `radius --r-pill`/`--r-lg`. Sticky abajo, sobre safe-area, sube con el teclado.
- **Free (Drucker):** contador discreto "2 de 3 preguntas gratis este mes"; al agotar → burbuja-teaser + `UpgradeModal.js` (no corta a media respuesta).

### 1.8 Guardrail visual (Karpathy §7)
En temas de condición médica: **DisclaimerNote** discreta bajo la burbuja (`text-caption`, `--text-3`, icono info) — *"Esto es orientación general, no consejo médico."* Nunca popup invasivo, nunca estética de hospital.

---

## 2. NOTIFICACIONES PUSH — tarjetas (`components/notif/PushCard.js`)

Diseño de la notificación (PWA Web Push) y su render dentro de la app. Un tipo, un icono lineal, un CTA. Nunca alarmante.

| Tipo | Ejemplo de copy | CTA | `type` |
|---|---|---|---|
| **Pre-comida** | "Casi la hora de comer. ¿Qué tienes pensado? Te quedan 900 kcal." | Registrar / Sugerir | `premeal` |
| **Entreno** | "Entrenas en 2 h — un snack con carbos te dará energía." | Ver idea | `workout` |
| **Hidratación** | "Vas a medio día con 1 de 2.5 L. Un vaso ahora suma." | Agua +1 | `water` |
| **Resumen (PM)** | "Cierre del día: 88/100. Te faltó agua; mañana lo cerramos. 🔥 11 días." | Ver resumen | `summary` |
| **Consejo/AM** | "Buenos días. Hoy toca tirada larga: carga carbos al desayuno." | Abrir coach | `tip` |

- **Notificación nativa:** título corto + cuerpo 1 línea + ícono de marca + acción. `tag` por tipo para colapsar (no spamear).
- **In-app (centro §3):** tarjeta `--surface`, icono en círculo `--brand-tint`, título `text-sub` 600, cuerpo `text-caption` `--text-2`, hora, CTA fantasma. Deslizar para descartar.
- Tono: cálido y accionable, **jamás culpa** ("te pasaste" prohibido). Deep-link → abre chat contextual (§5) o la acción directa (Agua +1 sin abrir chat).

---

## 3. CENTRO DE NOTIFICACIONES / recordatorios (`app/perfil/notificaciones/page.js`)

Vive en Perfil → "Notificaciones". Lista de recordatorios configurables + modo global.

### 3.1 Modo global (arriba, segmented)
`components/notif/ModeSwitch.js` — 3 modos que ajustan **frecuencia y tono** de todo el conjunto:
- **Tranquilo:** solo lo esencial (resumen PM + 1 recordatorio/día). Silencioso, sin insistir.
- **Normal (default):** comidas + hidratación + resumen, ritmo equilibrado.
- **Entrenador:** proactivo — pre-comidas, entreno, hidratación, motivación. Para quien quiere que lo empujen.
> El modo cambia defaults de la lista; el usuario siempre puede afinar cada ítem.

### 3.2 Lista de recordatorios (`components/notif/ReminderRow.js`)
Cada fila: icono + nombre + horario/frecuencia + **toggle**. Tap → hoja de detalle (hora, días, frecuencia).

```
┌─ Recordatorios ─────────────────────────────┐
│  Modo:  [ Tranquilo · (Normal) · Entrenador ]│
├─────────────────────────────────────────────┤
│  ☀ Desayuno        8:00        [ ●]          │
│  🍽 Comida          14:00       [ ●]          │
│  🥪 Snack           17:30       [○ ]          │
│  🌙 Cena            21:00       [ ●]          │
│  💧 Hidratación     cada 2 h    [ ●]          │
│  🏃 Entreno         según plan  [ ●]          │
│  📋 Resumen diario  21:30       [ ●]          │
├─────────────────────────────────────────────┤
│  🔕 Silenciar todo hasta mañana              │
│  No molestar:  22:00 – 7:00                   │
└─────────────────────────────────────────────┘
```
- **Activar/desactivar:** toggle por recordatorio (`--brand` activo).
- **Cambiar horario/frecuencia:** tap fila → hoja con time-picker + días (chips L-D) + frecuencia (para hidratación: cada 1/2/3 h).
- **Silenciar:** "Silenciar todo hasta mañana" (snooze global) + ventana **No molestar** (respeta horario de sueño → 0 push nocturnos).
- Iconos lineales (los emojis del wire son solo ilustrativos). Toggles y filas ≥44px, foco visible.

---

## 4. SELECTOR DE PERSONALIDAD (`components/coach/PersonalityPicker.js`)

Los 5 tonos de Karpathy (Adendum A2). Se abre desde la cabecera del chat (§1.1) o en onboarding/Perfil. **El momento que hace el coach *suyo*.**

```
┌─ ¿Cómo quieres que te hable tu coach? ───────┐
│  ┌───────────────────────────────────────┐  │
│  │ ● Sereno     "Vas bien. Si te apetece, │  │  ← preview EN VIVO
│  │              unos 25 g de proteína      │  │     de la MISMA frase
│  │              redondean tu día."         │  │
│  └───────────────────────────────────────┘  │
│  ○ Amigable     ○ Entrenador                 │
│  ○ Analítico    ○ Directo                    │
│  [ Elegir este tono ]                         │
└─────────────────────────────────────────────┘
```
- **Preview en vivo:** al seleccionar un tono, la tarjeta de arriba reescribe **la misma situación** ("te faltan 25 g de proteína") en ese tono (textos de Karpathy A2). Se *siente* la diferencia antes de elegir.
- 5 tonos: **Amigable/motivador · Entrenador (exigente) · Analítico (datos) · Sereno/tranquilo · Directo**. Default inteligente: **Sereno**.
- **Free vs Pro (Drucker §7.2):** 1–2 tonos en Free (Sereno default), los 5 + cambio libre en Pro → chip "Pro" con candado en los bloqueados → `UpgradeModal.js`.
- Cambiar tono **no borra memoria** (es tu coach con otra voz). Guarda `personalidad` en perfil. En zona clínica el tono se modera solo (regla dura de Karpathy — la UI no lo deja "cuate" ahí).

---

## 5. CHAT CONTEXTUAL desde una notificación

Al tocar una push, no se abre el chat "en frío": se abre **ya en contexto**, con el tema precargado.
- **Deep-link:** `type` de la notificación (§2) → abre `app/coach` con un **mensaje-semilla del coach** ya visible + acciones rápidas filtradas al tema.
  - `premeal` → *"¿Vemos qué comes? Te quedan 900 kcal y 60 g de proteína."* + chips [Sugerir comida] [Analizar foto].
  - `water` → acción directa **Agua +1** (puede resolverse sin abrir chat) o burbuja de confirmación.
  - `summary` → abre `ProgressCard` del día + *"¿Quieres ver el detalle?"*.
  - `workout` → *"Antes de entrenar…"* + sugerencia de snack.
- Visualmente idéntico al chat normal (§1); la diferencia es el **estado inicial precargado** (una prop `seed`/`context`). El usuario continúa la conversación con naturalidad.
- Si venía de "No molestar" o silenciado, no se abre nada hasta que el usuario entra.

---

## 6. MAPEO A ARCHIVOS DEL REPO

| Pieza | Archivo | Acción |
|---|---|---|
| Pantalla/hoja Coach | `app/coach/page.js` | **Nuevo** |
| Cabecera | `components/coach/CoachHeader.js` | **Nuevo** |
| Saludo contextual | `components/coach/CoachGreeting.js` | **Nuevo** |
| Acciones rápidas | `components/coach/QuickActions.js` | **Nuevo** |
| Burbuja | `components/coach/ChatBubble.js` | **Nuevo** |
| Tarjetas de burbuja | `components/coach/MealSuggestionCard.js`, `FoodAnalysisCard.js`, `ProgressCard.js` | **Nuevo** |
| Análisis embebido | `components/AddMealModal.js` | **Reusar** (modo embebido) |
| Anillo/sparkline en tarjeta | `components/ProgressRing.js`, `components/WeekChart.js` | **Reusar** |
| Escribiendo/streaming | `components/coach/TypingIndicator.js` | **Nuevo** |
| Compositor | `components/coach/Composer.js` | **Nuevo** |
| Selector personalidad | `components/coach/PersonalityPicker.js` | **Nuevo** |
| Push card (in-app) | `components/notif/PushCard.js` | **Nuevo** |
| Centro notificaciones | `app/perfil/notificaciones/page.js` | **Nuevo** |
| Modo global | `components/notif/ModeSwitch.js` | **Nuevo** |
| Fila de recordatorio | `components/notif/ReminderRow.js` | **Nuevo** |
| Contador Free/Pro | `lib/usage.js` | **Reusar** |
| Paywall | `components/UpgradeModal.js` | **Reusar** |
| Registrar comida | `app/api/meals` | **Reusar** |
| Orbe de entrada | `components/TabBar.js` | **Reusar** (abre el chat) |

---

## 7. DEPENDENCIAS
- **Karpathy:** endpoint de chat **con streaming** (SSE/stream) + objeto de contexto; textos de los 5 tonos para el preview (§4); semillas por `type` de notificación (§5); guardrails/disclaimers §7. Endpoint de "consejo/insight" para el saludo.
- **CTO:** Web Push PWA (service worker, `manifest`, permisos, `web-push` server + VAPID); persistir config de recordatorios y `personalidad`; deep-links por `type`; No-molestar server-side (no enviar en ventana de sueño).
- **Drucker:** confirmar corte Free/Pro del chat (3/mes) y tonos (1–2 Free), ya asumidos aquí.

> **Nota anti-saturación (resumen):** una sola pantalla de chat limpia, un acento, tarjetas accionables en vez de muros de texto, carga con puntos que respiran, y notificaciones cálidas y espaciadas gobernadas por 3 modos. Ni chatbot de botones, ni consultorio médico: un coach sereno que además te habla con tu propia voz elegida.
