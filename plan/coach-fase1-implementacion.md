# Coach IA — Fase 1 (chatbox reactivo) · Plan de implementación

**LEAD:** Torvalds (CTO) · **Base:** `plan/coach-arquitectura.md`, `plan/coach-cerebro.md` (Karpathy), `plan/coach-ui-spec.md` (Rams).
**CRÍTICO:** app viva (Ola 1 + Stripe). **No romper producción.** Todo aditivo bajo `/api/coach/*` + tablas nuevas. Build verde. **Nada a producción sin revisión del Director.**

## Alcance Fase 1
Chatbox "Mi Coach" con **contexto (4 capas)** · acciones rápidas · **acciones desde el chat (tool-use** que **reusa** `/api/analyze`, `/api/meals`, `/api/profile`) · **4 personalidades** · **Pro-gated** (Free = degustación).

**Principio (Karpathy):** determinista en la decisión, IA en la redacción; **nunca inventa cifras** (usa los números del motor Ola 1); guardrails médicos invariantes; restricciones duras (alergias) en **código**.

---

## Esquema nuevo (Supabase, aditivo e idempotente; lo corre Emiliano)
| Tabla | Para |
|---|---|
| `coach_conversations` | hilos de "Mi Coach" (1 por usuario en F1) |
| `coach_messages` | turnos (role, content, tokens, model) — L3 |
| `coach_summaries` | resumen rolling de la conversación — L3 |
| `coach_memories` *(slice retrieval)* | hechos/preferencias + embedding (pgvector) — L4 |

RLS: CRUD propio `auth.uid()`. **No toca** meals/profiles/targets/stripe.

---

## Rutas nuevas (`/api/coach/*`)
- `POST /api/coach/chat` — **streaming** (nodejs). getUser 401 → gate Pro/Free → arma contexto → Claude Haiku stream → persiste turno.
- `GET /api/coach/history` — mensajes del hilo del usuario.
- *(slices posteriores)* tools: `registrar_comida_foto`→`/api/analyze`+`/api/meals`, `cambiar_plan`→`/api/profile`, `registrar_texto`, `generar_cena`, `search_food_db`, `save_memory`.

## Componentes (Rams `coach-ui-spec.md`)
`app/coach/page.js` (hoja/ruta), `CoachHeader`, `CoachGreeting`, `ChatBubble`, `Composer`, `TypingIndicator`, `QuickActions`, `PersonalityPicker`, tarjetas de acción (`MealSuggestionCard`/`FoodAnalysisCard`). Entrada: orbe Coach (tab bar) — en F1, botón "Mi Coach" en HOME.

## Ensamblado de contexto (4 capas)
- **L1** persona (tono) + guardrails + perfil (`nutrition_profiles`) + metas (`nutrition_targets`) + restricciones → **bloque system cacheado**.
- **L2** estado de hoy = `targets − Σ meals(hoy)` (pendientes), hora local.
- **L3** últimos N turnos (`coach_messages`) + resumen (`coach_summaries`).
- **L4** retrieval pgvector (`coach_memories`) — **slice posterior**.

---

## Secuencia por REBANADAS (aditivas, testeables)

### 🍰 Rebanada 1 — Fundación *(se entrega ahora)*
Tablas (`coach_conversations`/`coach_messages`/`coach_summaries`) + `POST /api/coach/chat` con **STREAMING** + **ensamblado de contexto L1–L3** + chat básico **SIN tools** + UI mínima `app/coach/page.js` (hilo + compositor + streaming) + gate Pro/Free básico. *Test: enviar mensaje → el coach responde en streaming conociendo tus metas y lo que llevas hoy.*

### 🍰 Rebanada 2 — Personalidades + saludo contextual
Selector de las 4 personalidades (persiste en `nutrition_profiles.tone`) + `CoachGreeting` anclado a datos + acciones rápidas. *Test: cambiar tono cambia la voz, no los números.*

### 🍰 Rebanada 3 — Tool-use (acciones, reuso)
Bucle de tool-use: `registrar_comida_foto` (reusa `/api/analyze`+`/api/meals`), `registrar_texto`, `cambiar_plan` (reusa `/api/profile`), `generar_cena`, `search_food_db`, `save_memory`. Confirmación en UI para mutaciones; filtros duros de alergia en código. *Test: "regístrame 2 tacos" crea la comida.*

### 🍰 Rebanada 4 — Memoria/retrieval (L4)
`coach_memories` + pgvector + extracción de hechos + resumen rolling. *Test: recuerda una preferencia dicha antes.*

### 🍰 Rebanada 5 — Cuota/costo dura + Pro-gate final
Ledger `ai_usage` por-feature + caps en `app_config` + airbag/kill-switch + contador Free "N de 3 gratis". *Test: Free agota degustación → paywall sin cortar respuesta.*

**Orden:** R1 → R2 → R3 → R4 → R5. Cada una lanzable.

---

## Rebanada 1 — entregable de este reporte
- `supabase/coach.sql` — 3 tablas + RLS (idempotente, aditivo).
- `lib/coach/persona.js` — system prompt (4 tonos + guardrails + foco por coach).
- `lib/coach/context.js` — ensambla L1–L3.
- `app/api/coach/chat/route.js` — streaming (Anthropic SDK) + persistencia + gate básico.
- `app/api/coach/history/route.js` — historial del hilo.
- `app/coach/page.js` — chat mínimo (streaming). Entrada "Mi Coach" en HOME.
- Build verde; sin tocar analyze/meals/profile/Stripe.

> **Nota de costo:** R1 usa Haiku y gate básico Pro/Free; el **cap duro** (`ai_usage`+`app_config`) llega en R5. **No exponer a producción** hasta R5 + tu revisión (evita gasto sin techo del chat).
