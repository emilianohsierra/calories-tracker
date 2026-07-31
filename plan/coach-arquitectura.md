# Coach IA — Arquitectura (chatbox proactivo + notificaciones)

**Autor:** Torvalds (CTO) · **Para:** Lugia (Director)
**Base:** `plan/rediseno-arquitectura-tecnica.md` (4 capas de memoria, coach componible, costo), `plan/rediseno-coach-ia.md` (coaches, guardrails, costo §8), y el repo actual (Ola 1 ya vivo).
**Estado:** DISEÑO de arquitectura. **Sin código.** 🔶 = pido tu VB.
**Reglas:** reusar lo de Ola 1, **no duplicar**, **no romper lo vivo** (`/api/analyze`, `/api/meals`, Stripe, `/api/profile`). Todo aditivo bajo `/api/coach/*` + tablas nuevas.

## Qué ya existe y REUSAMOS (no se toca su contrato)
- **Perfil + plan calculado:** `nutrition_profiles`, `nutrition_targets` (motor determinista `lib/nutrition/*`). → contexto L1/L2.
- **Comidas:** `meals` (+ `GET /api/meals`, totales del día). → estado del día L2.
- **Foto→análisis:** `/api/analyze` (Claude visión + billed + reembolso + cuota). → acción "registrar por foto".
- **Cuota/costo:** `app_config` (límites + airbag + kill-switch), `usage_counters`, patrón atómico `consumir_analisis`. → se **generaliza** a un ledger por-feature.
- **Auth/RLS:** middleware `getUser`, RLS por `auth.uid()`, `service_role` solo-webhook. → mismo modelo.
- **Coach componible** (persona por módulos) y **tono** (`nutrition_profiles.tone`). → system prompt.

---

## (1) Arquitectura del Coach — backend del chat

**Endpoint:** `POST /api/coach/chat` (runtime **nodejs**, respuesta en **streaming**).
1. `getUser()` → 401. 
2. **Reserva de cuota** por-feature (`feature='chat'`) con el patrón atómico existente → 429 si excede (Free degustación / Pro generoso).
3. Arma el contexto (4 capas, abajo) y llama a **Claude Haiku** con `stream: true`; reenvía tokens al cliente (SSE/ReadableStream).
4. **Bucle de tool-use:** si el modelo pide una herramienta (§5), se ejecuta (RLS), se devuelve el resultado y se continúa el stream.
5. Persiste el turno en `messages` (con `tokens_in/out`, `model`) y actualiza el resumen si toca.

### Contexto/memoria — las 4 capas (reusa el diseño aprobado)
| Capa | Contenido | Origen | Coste |
|---|---|---|---|
| **L1 perfil estable** | persona del coach (tono) + `nutrition_profiles` + `nutrition_targets` + definición de tools | tablas Ola 1 | **prompt-cacheado** (~0.1×) |
| **L2 estado del día** | macros pendientes = `targets − Σ meals(hoy)`, tendencia de peso, próximo entreno, racha | `meals`/`daily_snapshots` (Postgres) | in normal, pequeño |
| **L3 conversación** | últimos N turnos verbatim + **resumen rolling** de lo viejo | `messages` + `conversation_summaries` | in normal |
| **L4 retrieval (RAG)** | top-k hechos/preferencias/platillos **relevantes a la pregunta** | `user_memories`/`meal_memories` (pgvector) | in normal + 1 embed |

**El prompt no crece con el tiempo:** L1 cacheado, L2 chico, L3 resumido, L4 solo lo relevante.

### Dónde se guardan las conversaciones (tablas NUEVAS, RLS propio)
```
conversations(id, user_id, title, created_at, last_active_at)
messages(id, conversation_id, user_id, role, content, tool_calls jsonb, tokens_in, tokens_out, model, created_at)
conversation_summaries(conversation_id, summary, upto_message_id, updated_at)
user_memories(id, user_id, kind, text, embedding vector, created_at)      -- hechos/preferencias
meal_memories(id, user_id, title, macros jsonb, embedding vector, ...)     -- "mis platillos"
daily_snapshots(user_id, date, kcal, prot, carb, fat, adherence, weight_trend)  -- para L2/eventos
```
pgvector con índice **HNSW**. Embeddings vía interfaz `lib/embeddings` (proveedor a decidir). 🔶 **VB-C1:** Voyage (alineado Anthropic) vs OpenAI `text-embedding-3-small`.

---

## (2) Motor de proactividad / eventos

**Disparo:** **Vercel Cron** cada ~15–30 min → `POST /api/coach/cron/tick`. Selecciona usuarios elegibles por **timezone** (hora local) y evalúa reglas **deterministas** sobre sus datos. Solo genera texto (Haiku) cuando una regla **dispara** Y el anti-spam (§3) lo permite.

| Evento | Tipo | Cómo se detecta (regla determinista) |
|---|---|---|
| `meal_time` | horario | ventana de comida del usuario y sin registro en esa franja |
| `missed_meal` | datos+horario | pasó la franja de comida sin registro |
| `low_protein` | datos | proteína del día << objetivo a cierta hora |
| `low_hydration` | datos | agua registrada < umbral por hora del día |
| `workout_approaching` | horario | `coach_params`/agenda: entreno en < X h |
| `workout_completed` | datos/entrada | usuario marcó entreno o ventana post pasó |
| `goal_progress` | datos | hito de tendencia de peso / adherencia |
| `streak` | datos | racha alcanza hito (7/14/30) o en riesgo (día de gracia) |
| `weekly_review` | horario | 7 días desde el alta / domingo PM |
| `unusual_behavior` | datos | patrón atípico (p.ej. 0 registros varios días, atracón) → tono cuidado |
| `user_inactivity` | horario | N días sin abrir la app → reengagement |

- **Fuente de verdad:** `meals`, `nutrition_targets`, `daily_snapshots`, `streaks`. Cero IA para **detectar**; IA solo **redacta**.
- **Idempotencia:** `notification_log(user_id, event_type, dedupe_key)` con **UNIQUE** (p.ej. `dedupe_key = event_type+date+slot`) → nunca se dispara dos veces el mismo evento/día. Mismo patrón que `stripe_events`.
- **Salida de un evento:** (a) mensaje en la conversación del coach (para abrir el chat con contexto, §4), (b) push (§3), (c) item de feed.
- **Fusión:** eventos del mismo slot (p.ej. plan del día + consejo del día) se **generan en una sola llamada** (VB-A5 ya aprobado) para no duplicar costo/notificación.

---

## (3) Notificaciones — web push + anti-spam

**Web Push (PWA):**
- `app/manifest.json` + **service worker** (`public/sw.js`) + suscripción `PushSubscription` (VAPID) guardada en `push_subscriptions(user_id, endpoint, keys, tz, created_at)`.
- **Permiso:** se pide **después de mostrar valor** (no al cargar), tras el onboarding o el primer registro. iOS ≥16.4 soporta push en PWA instalada; **fallback siempre al feed in-app**.
- **Scheduling por timezone:** el cron horario usa `push_subscriptions.tz`/`nutrition_profiles`; cada usuario recibe en su hora local. **Quiet hours** (no molestar de noche).

**Inteligencia anti-spam (frecuencia adaptativa):**
- **Modos** (elige el usuario, `nutrition_profiles.coach_mode`): **tranquilo** (~1/día, solo lo esencial) · **normal** (~2–3/día) · **entrenador** (proactivo, varios/día).
- **Presupuesto de notificaciones/día** por modo + **prioridad por evento** (seguridad/racha-en-riesgo alto; nice-to-have bajo). Al agotar el presupuesto solo pasan las de alta prioridad.
- **Adaptación por engagement:** `notification_log` registra entregada/abierta/ignorada. Un **score de engagement** por usuario baja la frecuencia si ignora N seguidas (back-off exponencial) y la mantiene/sube si interactúa. Se recalcula a diario (determinista, 0 IA).
- **Anti-repetición:** no repetir el mismo `event_type`/foco en X días (se guarda el foco, no el texto).

🔶 **VB-C2:** modos por defecto = **normal**, con opción a tranquilo/entrenador en ajustes.

---

## (4) Chat contextual desde una notificación

- El **payload del push** lleva `{ event_type, conversation_id, deep_link }`.
- **Deep link:** `/coach?c=<conversation_id>` (o abre la hoja del Coach). El mensaje proactivo **ya está** en `messages` de esa conversación (§2), así que al abrir se ve el mensaje del coach con su contexto y el usuario responde en el mismo hilo → continuidad total.
- Si el usuario abre sin notificación, entra a la conversación activa (o una nueva) con el mismo contexto de 4 capas.

---

## (5) Acciones desde el chat — tool-use anclado a datos (RLS)

El coach **actúa**, no solo habla. Cada tool = endpoint/RPC **con RLS** (nunca toca datos de otros); las mutaciones sensibles piden **confirmación** en UI (tarjeta con "Guardar/Cancelar").

| Tool | Qué hace | Reusa |
|---|---|---|
| `get_macros_today` / `get_weight_trend` / `get_adherence` | lee estado | `meals`/`daily_snapshots` |
| `search_food_db` | grounding de cifras (no alucinar) | BD nutricional (SMAE/USDA/OFF, Beta) |
| `generar_cena` / `crear_plan_comida` | opciones que cierran los macros pendientes; **diff-regeneration** | motor determinista + Haiku |
| `registrar_comida_foto` | dispara el pipeline de visión y guarda | **`/api/analyze` + `/api/meals`** (reuso directo) |
| `registrar_comida_texto` | "2 tacos de pastor" → items+macros | Haiku + `meals` |
| `cambiar_plan` | recalcula targets | **`/api/profile` + `computeTargets`** (reuso) |
| `actualizar_contexto_dia` | "hoy entreno 6pm" → ajusta L2/eventos | `daily_snapshots`/`coach_params` |
| `lista_super` | diff determinista de ingredientes, respeta filtros duros | código |
| `save_memory` | guarda hecho/preferencia | `user_memories` (+embedding) |

**Guardrails (código, no solo prompt):** filtros DUROS de alergia/celiaquía en las tools de plan/receta; el system prompt tiene autoridad (anti-inyección); en coaches médicos (futuro) overlay conservador + guardrail de salida. **La IA nunca inventa cifras**: si emite una fuera del motor/tool, se ignora en UI (regla de Karpathy).

---

## (6) Costo / margen

- **Ledger por-feature** (generaliza `usage_counters`): `ai_usage(user_id, period, feature, count, tokens)` con `feature ∈ {chat, plan, proactivo, texto}`; límites en `app_config` (`chat_msgs_day`, `proactivos_day`, …). Reserva atómica tipo `consumir_analisis`.
- **Haiku por defecto**; **Sonnet** solo para planificación compleja como **upsell "IA avanzada"** (model router por feature/tier).
- **Prompt caching** de L1 (perfil+persona+tools) → input a 0.1×.
- **Anti-spam = control de costo directo:** menos generaciones proactivas = menos tokens; el presupuesto por modo **acota** el gasto proactivo por usuario.
- **Airbag global + kill-switch por feature** (ya existe para análisis) → tope duro de gasto + apagado sin redeploy.
- **Diff-regeneration** de planes + **memoria de platillos** (0 costo) + **generación fusionada AM** (plan+consejo en 1 llamada).
- **Telemetría** (`ai_usage.tokens`) → detectar power-users, dashboard de margen (gasto IA / ingreso). Meta: IA **<15–20%** del ingreso; **peor caso acotado por diseño**.

---

## (7) Plan por fases

### 🟢 Fase 1 — Chatbox REACTIVO (el corazón, sin proactividad)
- `POST /api/coach/chat` con **streaming** + **4 capas** de contexto + **tool-use** (§5) + **personalidad/tono**.
- Tablas: `conversations`, `messages`, `conversation_summaries`, `user_memories`, `meal_memories` (pgvector), `daily_snapshots`; ledger `ai_usage`.
- UI: hoja/orbe Coach en HOME (Rams) → chat; tarjetas de confirmación para acciones.
- Entrega valor: el usuario **conversa** con su coach, que **conoce sus datos y actúa**. Pro-gated (degustación Free).

### 🟡 Fase 2 — PROACTIVIDAD + notificaciones
- Motor de eventos (§2) sobre Vercel Cron + reglas + idempotencia.
- Web push (§3) + scheduling por timezone + **anti-spam adaptativo** + modos.
- Abrir chat desde notificación (§4).
- (Reusa la generación fusionada AM del plan+consejo ya diseñada.)

> Regla de corte (equipo de 2): cada sub-rebanada lanzable y reversible; Fase 1 primero, valida retención antes de invertir en proactividad.

---

## (8) Mapa de reuso / aditivo (no rompe lo vivo)
**Reusa:** `nutrition_profiles`, `nutrition_targets`, `lib/nutrition/*`, `meals`, `/api/analyze`, `/api/meals`, `/api/profile`, `app_config`/`usage_counters` (patrón de cuota), middleware/RLS, coach componible + `tone`.
**Nuevo (aditivo):** tablas de conversación/memoria/push/notification_log/ai_usage/daily_snapshots; endpoints `/api/coach/*` (chat, cron/tick, tools); service worker + manifest; nuevo Cron. **Sin cambiar** el contrato de analyze/meals/stripe/profile.

**Riesgos y mitigaciones:**
| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Costo IA se dispara (chat/power-users) | ledger+caps por feature, Haiku, caching, anti-spam, airbag |
| R2 | Timeouts de Vercel en streaming/lotes | streaming en el chat; cron por lotes/cola para lo pesado; plan Vercel Pro |
| R3 | Rate-limits de Anthropic | cola con concurrencia limitada + backoff en el cron |
| R4 | Notification spam / churn | presupuesto por modo + engagement adaptativo + quiet hours + prioridad |
| R5 | Push poco fiable (iOS) | requiere PWA instalada; **fallback al feed** siempre |
| R6 | Datos de salud sensibles | RLS en todo, minimizar, consentimiento; `service_role` sigue solo-webhook |
| R7 | Prompt injection / cifras inventadas | system con autoridad; tools con RLS; **ignorar cifras fuera del motor** |
| R8 | Legal/clínico | Ola 1 coaches **no-médicos**; guardrails escalables; médicos difieren con validación |
| R9 | Migración de esquema en vivo | SQL idempotente y aditivo, revisado por ti antes de que Emiliano lo corra |

---

## Puntos que necesitan tu VB
- **VB-C1:** proveedor de embeddings (Voyage recomendado vs OpenAI).
- **VB-C2:** modo de notificaciones por defecto = normal (con tranquilo/entrenador).
- **VB-C3:** Fase 1 (chat reactivo) como primer entregable, proactividad/push en Fase 2.
- **VB-C4:** cola para el cron de Fase 2 = Upstash QStash (gestionada) vs tabla-cola propia.

## TL;DR
El Coach se monta **sobre lo que ya existe**: perfil/targets de Ola 1 como L1/L2, `meals`+`/api/analyze` como estado y acción, `app_config`/cuotas como control de costo. **Fase 1 = chat reactivo** con 4 capas de contexto + tool-use anclado a datos (RLS) + personalidad, todo aditivo y Pro-gated. **Fase 2 = proactividad** (Vercel Cron + reglas deterministas + web push + anti-spam adaptativo por engagement/modo). El margen queda **acotado por diseño** (Haiku + caching + caps + anti-spam como control de costo). Riesgo #1 = costo y spam, ambos controlados; riesgo legal se evita manteniendo Ola 1 en coaches no-médicos.
