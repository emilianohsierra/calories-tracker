# Rediseño técnico — De tracker a compañero de salud con IA

**Autor:** Torvalds (CTO / Arquitecto SaaS) · **Para:** Lugia (Director)
**Fecha:** 2026-07-29 · **Estado:** DISEÑO de arquitectura para revisión. **Sin código.** 🔶 = pido tu VB.
**Alinea con:** `plan/premium-vision-producto.md` (Drucker) y `plan/premium-vision-nutricion-ia.md` (Karpathy).

## Restricciones y principios
- **Stack fijo:** Next.js 15 (App Router) + Supabase (Postgres + RLS + Storage + pgvector + pg_cron) + Vercel (serverless + Cron) + Anthropic Claude. Se **monta sobre el Stripe Pro ya enviado**.
- **Móvil-first PWA**, no nativa por ahora. **Decisión de portabilidad:** toda la lógica vive en **route handlers + Supabase (API-first)**; el cliente (PWA) es "tonto". Si algún día se necesita nativa (React Native/Expo), **reusa el mismo backend y Supabase** sin reescribir el dominio. 🔶 **VB-A0:** confirmar PWA-first con backend API-first como contrato de portabilidad.
- **Regla de margen (heredada):** el registro manual/texto es gratis; se capea lo que **cuesta** (IA) y se reserva lo que **diferencia** (coaching). Reutilizamos el patrón `app_config` + `usage_counters` + airbag global + kill-switch que ya está en producción.
- **Regla de oro de costo:** *nunca mandar todo el historial a Claude.* El "no olvidar" se logra por **capas + retrieval + resumen + prompt caching**, no por contexto gigante.

---

## (1) Arquitectura de memoria/contexto persistente

### 1.1 Modelo de datos (nuevas tablas Supabase, todas con RLS por `user_id`)
- **`nutrition_profiles`** — el perfil de §2.1 de Karpathy (objetivo primario/secundarios, sexo, edad, peso, altura, PAL, patrón dietético, intolerancias[], alergias[], condiciones_medicas[], país, presupuesto, tiempo_cocina) + derivados calculados (TDEE, kcal_objetivo, macros_objetivo). **1 fila/usuario.** Es la fuente del "perfil compacto".
- **`conversations`** / **`messages`** — hilos del chat coach; `messages(role, content, tokens_in, tokens_out, model, created_at)`. Auditables y facturables por token.
- **`conversation_summaries`** — resumen rolling del historial viejo de cada conversación (texto corto que sustituye a los mensajes antiguos).
- **`user_memories`** — hechos/preferencias de largo plazo ("no le gusta el pescado", "entrena 6am", "alergia a nuez") con **embedding** (pgvector) para retrieval. Se extraen automáticamente del chat/registro.
- **`meal_memories`** ("Mis platillos") — platillos recurrentes con macros ya resueltos → **0 costo de IA** para lo repetido; opcional embedding para "algo como mi desayuno típico".
- **`daily_snapshots`** — foto diaria del estado (kcal/macros consumidos, adherencia, tendencia de peso 7d). Alimenta el reporte, el feedback y el motor adaptativo sin recomputar.

pgvector: extensión `vector` + índice **HNSW** en `user_memories.embedding` y `meal_memories.embedding`.

### 1.2 Estrategia de contexto en 4 capas (lo que se le manda a Claude por request)
| Capa | Qué es | Tamaño | Cómo se maneja | Costo |
|---|---|---|---|---|
| **L1 — Perfil estable** | Objeto compacto §3.1 (perfil + persona del coach + definición de tools) | ~1.5–2k tok | Va en el **bloque system, PROMPT-CACHEADO** (`cache_control`). Cambia poco → casi siempre cache hit | ~0.1× lectura |
| **L2 — Estado volátil de hoy** | `macros_pendientes_hoy`, tendencia_peso_7d, adherencia, entrenos próximos | ~200–400 tok | Se **computa en Postgres** (de `daily_snapshots`) y se **inyecta fresco** cada request (no se cachea; cambia a diario) | in normal |
| **L3 — Conversación** | Últimos N turnos **verbatim** + **resumen** de lo anterior | ~1–2k tok | Ventana deslizante; al superar umbral, se **resume** lo viejo a `conversation_summaries` y se descartan los mensajes crudos del prompt | in normal |
| **L4 — Retrieval (RAG)** | Top-k `user_memories`/`meal_memories` **relevantes a la pregunta** | ~300–800 tok | Búsqueda vectorial (pgvector) solo cuando aporta; no se manda toda la memoria | in normal + 1 embed |

**Resultado:** un mensaje típico manda ~4–5k tok de entrada de los cuales ~1.5k son cacheados a 0.1×. Así el coach "recuerda todo" (perfil + hechos + platillos + hilo) **sin** crecer el prompt con el tiempo.

### 1.3 Prompt caching (Anthropic)
- Estructurar el prompt con **prefijo estable primero** (persona del coach + tools + perfil L1) marcado con `cache_control` → cache hit ~0.1× en input. TTL 5 min (o 1h) — como el chat es ráfaga, casi todo el hilo pega en caché.
- El estado volátil (L2/L3/L4) va **después** del bloque cacheado para no invalidar el prefijo.

### 1.4 Embeddings
- Anthropic no ofrece embeddings; opciones: **Voyage AI** (recomendado por Anthropic, barato/bueno) u **OpenAI `text-embedding-3-small`**. Se abstrae detrás de una interfaz (`lib/embeddings`) para no casarnos. 🔶 **VB-A1:** proveedor de embeddings (recomiendo Voyage por alineación Anthropic; OpenAI si ya hay cuenta).
- Se embeben al escribir (`user_memories`/`meal_memories`), no en caliente por request salvo la query.

---

## (2) Sistema multi-coach

**Definición:** `coach = persona (system prompt) + datos/tools especializados + contexto del usuario (L1–L4)`.

**Decisión clave (🔶 VB-A2):** NO construir N coaches monolíticos. Un coach = **prompt COMPONIBLE por módulos** ensamblado en servidor:
```
[persona base + tono + guardrails globales]           ← estable, cacheado
  + [módulo de OBJETIVO]   (perder grasa | músculo | running | keto…)   ← de la taxonomía §1
  + [módulo de PATRÓN dietético]  (vegano | low-carb…)                  ← restricciones de estilo
  + [overlay MÉDICO]  (modo conservador + disclaimers)  si aplica       ← §5, sobrescribe
  + [definición de TOOLS disponibles]
```
Ventaja: cubrir decenas de objetivos/condiciones **sin** decenas de prompts que mantener; el "coach de maratón vegano prediabético" se compone. Un registro `coach_modules` (o config en código versionada) guarda cada módulo.

**Tools (Claude tool use) — el coach ACTÚA y se ANCLA en datos, no alucina:**
- `get_macros_today()`, `get_weight_trend()`, `get_adherence()` → leen `daily_snapshots`.
- `search_food_db(query)` → grounding contra BD nutricional (SMAE/USDA/OFF, Beta de Karpathy).
- `create_or_update_meal_plan(...)`, `log_meal(...)`, `adjust_targets(...)` → escriben vía RPC.
- `save_memory(fact)` → alimenta `user_memories`.
Cada tool es un endpoint/RPC con **RLS**: el LLM no toca datos de otros usuarios.

**Capa de guardrails (código, no solo prompt):**
- **Filtros DUROS** (alergia/celiaquía/veganismo) validados en **código** dentro de las tools de plan/receta: una salida que incluya el alérgeno se **bloquea/reintenta**, nunca se muestra (§5.3, §3.3.4).
- **Modo médico**: para condiciones de "máxima cautela" (§5.3) se activa el overlay conservador + un **guardrail de salida** (validación extra, posiblemente un check con Haiku barato) antes de mostrar.
- **Anti-inyección**: el perfil/reglas van como system con autoridad; el mensaje del usuario no puede reescribirlas.

---

## (3) Motor de recálculo de planes de comida

**Principio: matemática determinista en código, IA solo para "vestir" opciones.** Esto abarata y da control.

**Pipeline:**
1. **Targets (código):** de `nutrition_profiles` (fórmulas §2.2: Mifflin/Katch, TDEE, déficit/superávit, macros) → `kcal_objetivo` + `macros_objetivo`. Cero IA.
2. **Reparto por comida (código):** desayuno 25% / comida 35% / cena 30% / snack 10% (configurable) → macros-target por comida.
3. **Generación de opciones (IA, Haiku):** por comida, la IA propone platillos que cumplen macros ±10%, **con `search_food_db` para los números** (grounding, no inventar). Preferir **plantilla + relleno**: partir de plantillas por objetivo/dieta y que la IA ajuste, no generar de cero.
4. **Filtros duros (código):** alergias/celiaquía/veganismo/presupuesto/tiempo — se validan tras la IA; lo que viole se descarta y se re-pide.
5. **Recálculo dinámico (el corazón):** si el usuario cambia/rechaza **una** comida → se recomputan en **código** los macros restantes del día y se **regenera SOLO la(s) comida(s) afectada(s)**, no el plan entero. Diff-based → ahorra tokens y da control (§3.4.4 de Karpathy).
6. Persistir en `meal_plans`/`meal_plan_items`; la memoria de platillos (`meal_memories`) cubre lo recurrente a 0 costo.

**Costo:** regenerar una comida ≈ ~$0.002 vs un plan diario completo ~$0.011 y semanal ~$0.05 → el diff es la palanca de margen.

---

## (4) Feedback diario programado (AM/PM)

**Reto:** generar 2 mensajes/día por usuario **en su hora local**, a escala, sin timeouts ni disparar costo/rate-limits.

**Arquitectura:**
- **Disparo:** **Vercel Cron** cada hora → route handler `POST /api/cron/daily-feedback`. (Alternativa: `pg_cron` de Supabase; recomiendo Vercel Cron por simplicidad con el stack.) 🔶 **VB-A3.**
- **Bucketing por timezone:** cada usuario tiene su `tz`; el cron horario selecciona a quienes en su hora local caen en la ventana AM (~7–9) o PM (~20–22). Solo esos se procesan esta corrida.
- **Cola/lote:** los seleccionados se procesan en **lotes** con concurrencia limitada (respetar rate-limits de Anthropic) vía una cola ligera (**Upstash QStash** o tabla `job_queue` + worker) para no exceder el límite de tiempo de una función serverless. 🔶 **VB-A4:** cola gestionada (QStash) vs tabla-cola propia.
- **Generación:** 1 llamada **Haiku** con **perfil cacheado (L1)** + `daily_snapshots` (L2). Barato (~$0.003).
- **Idempotencia:** una fila `daily_feedback(user_id, date, slot 'am|pm')` con UNIQUE → nunca 2 AM el mismo día (mismo patrón que `stripe_events`).
- **Entrega:** **Web Push (PWA, VAPID)** + item en el feed in-app. iOS ≥16.4 soporta web push en PWA instalada; fallback siempre al feed.
- **Gate de negocio:** el feedback proactivo diario es **Pro**; los inactivos se saltan (no gastar en quien no abre).

---

## (5) Modelo de costo de IA y protección de margen

**Base (Karpathy §6):** Haiku ~$1/M in, ~$5/M out; usuario medio ≈ **$0.70 USD/mes (~14 MXN)** ≈ **14% del ingreso** de 99 MXN. El **chat** es la variable que puede volar (power-user $2–3).

**Palancas de protección (todas reutilizan infra existente):**
1. **Caps por feature y tier** — generalizar `usage_counters` a un **ledger por feature** (`ai_usage(user_id, period, feature, count)` + límites en `app_config`: `chat_msgs_day`, `plans_month`, `feedback` on/off). Free = degustación (chat 3/mes, fotos 10/mes); Pro = generoso con **fair-use suave** (aviso a partir de X/día). Misma función atómica tipo `consumir_analisis` para reservar.
2. **Airbag global + kill-switch por feature** — ya existe para análisis; se extiende a chat/planes (tope global mensual de gasto IA + apagado sin redeploy).
3. **Prompt caching agresivo** del L1 (perfil+persona) → input a 0.1×.
4. **Tiering de modelo** — **Haiku por defecto**; **Sonnet** solo para planificación compleja como **upsell "IA avanzada"** (no en el flujo base). Un `model router` decide por feature/tier.
5. **Diff-regeneration + plantillas + memoria de platillos** — no regenerar lo que no cambió; recurrentes a 0 costo.
6. **Telemetría de costo por usuario** — guardar tokens/costo por llamada (`ai_usage`) → detectar power-users, alertar, aplicar fair-use. Dashboard de margen (gasto IA / ingreso).

**Meta de margen:** mantener IA **< ~15–20% del ingreso**; con caps, el peor caso está **acotado por diseño** (un usuario nunca puede gastar sin techo).

---

## (6) Plan de implementación por fases (alineado a las olas de Drucker)

| Ola (Drucker) | Qué se construye (técnico) | Infra nueva | IA |
|---|---|---|---|
| **Ola 1 — Coach mínimo** | `nutrition_profiles` + onboarding; **motor de cálculo determinista** (§2, cero IA); **reporte semanal** (1 llamada Haiku/sem sobre `daily_snapshots`); **registro por texto** (1 llamada chica); rachas (0 IA); paywall (hecho) | tabla perfil, `daily_snapshots`, cron semanal | mínima |
| **Ola 2 — Coach conversacional + hábitos** | **Chat con memoria L1–L4**, **tool use**, **guardrails**; **targets dinámicos** de macros (motor adaptativo §4); **"Mis platillos"**; **motor de planes v1** (§3) | `conversations`/`messages`/`summaries`, **pgvector** + `user_memories`/`meal_memories`, prompt caching, `ai_usage` ledger | núcleo |
| **Ola 3 — Profundidad** | Analítica/tendencias; **voz** (STT); **barcode**; **modo precisión Sonnet** (upsell); **feedback diario AM/PM a escala** (§4: cron horario + cola + web push) | cola/QStash, web push (VAPID), STT | alta |
| **Ola 4 — Expansión** | Planes/recetas completos, B2B, referidos/SEO | según demanda | según |

**Regla de corte (equipo de 2):** nada que no quepa en ~2 semanas por dev; se parte o pospone. El **motor determinista (Ola 1)** es deliberadamente barato en IA y ya justifica $99.

---

## (7) Riesgos técnicos y mitigaciones

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | **Costo IA se dispara** (power-users del chat) | Caps por feature + fair-use + airbag global + telemetría por usuario + Haiku default (§5). Peor caso acotado. |
| R2 | **"No olvidar" vs costo del contexto** | 4 capas + retrieval + resumen + caching (§1). El prompt no crece con el tiempo. |
| R3 | **Legal/clínico** (consejo a diabético/hipertenso) | Modo médico + guardrail de salida + disclaimers + **excluir auto-macros en "máxima cautela"** en MVP; revisión legal + nutriólogo colegiado **antes de producción** (§5 Karpathy). |
| R4 | **Filtro de alergias/celiaquía falla** | Validación DURA en **código** dentro de las tools de plan, doble check, etiqueta "verifica el etiquetado". Nunca solo-prompt. |
| R5 | **Límites de Vercel serverless** (timeout, streaming) | Chat con **respuesta en streaming**; trabajos pesados/lotes a **cola** (no en el request); plan Vercel Pro (60s). Cron horario, no monolítico. |
| R6 | **Rate-limits de Anthropic** a escala | Cola con concurrencia limitada + backoff; batching del feedback; monitor de 429. |
| R7 | **Datos de salud sensibles** (LFPDPPP MX/GDPR) | RLS ya en todo; **minimizar** lo que se guarda; cifrado en reposo (Supabase); consentimiento con fecha (§5.2); disciplina service_role (solo webhook, ya auditada). |
| R8 | **Prompt injection** vía mensaje del usuario | System con autoridad; tools validan y tienen RLS; guardrail de salida en modo médico. |
| R9 | **Web push poco fiable (iOS)** | Requiere PWA instalada (iOS ≥16.4); **fallback siempre al feed in-app**; no depender solo del push. |
| R10 | **pgvector a escala** | Índice HNSW; retrieval top-k acotado; poda de embeddings viejos. |
| R11 | **Lock-in de embeddings** | Abstracción `lib/embeddings`; proveedor intercambiable (VB-A1). |
| R12 | **Migración de esquema en vivo** | Como hasta ahora: archivos SQL idempotentes, revisados por ti antes de que Emiliano los corra; nada destructivo. |

---

## Addendum (adiciones de Emiliano) — confirmación de encaje

**(1) Muchos más especialistas (deportes / clínicos / dietas / etapas de vida) — ENCAJA sin cambios de arquitectura.**
El **coach componible (VB-A2)** escala a esta taxonomía por diseño: cada especialista es **otro módulo** (o combinación) en `coach_modules`, no un coach nuevo desde cero. Un caso como *"nadadora máster, vegetariana, menopausia"* se compone de `[objetivo:natación] + [patrón:vegetariana] + [etapa:menopausia] + overlay médico si aplica`. Escalar = **añadir filas de módulo**, no reescribir el motor.
- **Etapas de vida sensibles** (embarazo/lactancia, adolescentes, adulto mayor, menopausia) se tratan como **módulos con overlay conservador**, igual que las condiciones médicas de §5: **los guardrails DUROS aplican**. Confirmo:
  - **Filtro duro en código** (alergias/celiaquía/veganismo) → aplica a **todos** los módulos, clínicos y de etapa; nunca solo-prompt.
  - **Modo conservador + guardrail de salida + disclaimers** → se activa para clínicos de "máxima cautela" **y** para etapas sensibles (embarazo/lactancia, menores). En MVP: **sin auto-macros** para esos grupos (solo registro + educación + derivar a profesional), como ya recomienda §5/Karpathy.
  - La **composición** respeta la regla F-sobrescribe: el overlay médico/etapa **baja la agresividad** y puede **desactivar** features automáticas. Un módulo nuevo no puede "saltarse" un guardrail porque el ensamblado pone el overlay al final con autoridad.
- **Requisito operativo:** cada módulo clínico/etapa nuevo necesita **revisión de nutriólogo colegiado + legal** antes de exponerse (R3). El motor escala técnico; el cuello de botella es la validación profesional, no el código.

**(2) Personalidad adaptable (5 tonos) — ENCAJA como un módulo de prompt más, costo base intacto.**
Es un **módulo de PERSONA/TONO** (ej. *cercano, directo, motivador, técnico, sereno*) que se antepone en el bloque **L1 cacheado**. No toca la ciencia (targets/guardrails son deterministas y separados) ni el costo base: el tono son ~50–150 tokens dentro del prefijo **ya cacheado** (~0.1×) → **costo incremental ≈ 0**. Guardado como `nutrition_profiles.tono` (o `user_settings`), editable por el usuario. **Los guardrails NO dependen del tono**: un tono "directo" sigue sin dar consejo médico.

**(3) Consejo del día — ENCAJA como otro job programado Haiku, con su propio cap.**
Mismo patrón que el feedback AM/PM (§4): **Vercel Cron + bucketing por timezone + Haiku con perfil cacheado (L1) + idempotencia UNIQUE + web push/feed**. Se contabiliza en el **ledger por-feature** (§5) como `feature='consejo_dia'` con su **propio cap** (Pro-only, 1/día).
- **Costo incremental:** ~$0.003/consejo × 30 días ≈ **~$0.09 USD/mes (~1.8 MXN)** por usuario activo Pro.
- **Nuevo total medio por usuario:** ~$0.70 → **~$0.79 USD/mes (~15.8 MXN)** ≈ **~16% del ingreso** de 99 MXN. Sigue dentro de la meta (<15–20%) y **acotado por su cap**. Si se solapa con el feedback AM, se puede **fusionar** (un solo mensaje matutino "resumen + consejo") para no duplicar costo ni notificaciones — recomendado.

**✅ VB-A5 (aprobado con matiz) — fusionar la GENERACIÓN, separar la PRESENTACIÓN.**
- **Backend (barato):** **1 sola llamada Haiku** matutina (con perfil L1 cacheado) genera **plan del día + consejo del día** juntos, y **1 solo push AM**. Un único registro/idempotencia y **un solo cargo al cap** (no se duplica costo ni notificación). El generador devuelve un payload con ambas piezas (`{ plan_dia, consejo_dia }`).
- **UI (viral):** el **Consejo del Día** se presenta como su **propia TARJETA HERO compartible en Home** (diseño de Rams/Jony), separada del plan. Es el **mismo contenido generado en la misma llamada, mostrado distinto** → costo de uno, alcance de dos.
- **Resultado:** barato + potencial viral (la tarjeta compartible es marketing orgánico a costo IA cero adicional).

---

## Puntos que necesitan tu VB
- **VB-A0:** PWA-first + backend API-first como contrato de portabilidad a nativa futura.
- **VB-A1:** proveedor de embeddings (Voyage recomendado vs OpenAI).
- **VB-A2:** coach = prompt componible por módulos + tool use (vs coaches monolíticos).
- **VB-A3:** scheduler = Vercel Cron (vs pg_cron de Supabase).
- **VB-A4:** cola = Upstash QStash gestionada (vs tabla-cola propia).
- **✅ VB-A5:** generación fusionada (1 llamada + 1 push AM: plan + consejo) y presentación separada (Consejo del Día = tarjeta hero compartible en Home).
- **Transversal:** confirmar que el **motor determinista de Ola 1** (bajo IA) es el primer entregable, dejando el chat/memoria (costoso) para Ola 2 tras validar retención.

## TL;DR
Es **factible sobre el stack actual** sin cambiarlo: Supabase (pgvector, RLS, pg_cron) + Vercel (Cron, streaming) + Claude (tool use, prompt caching) cubren todo. El diseño mantiene el **margen acotado por diseño** (capas de contexto + caps + caching + tiering Haiku/Sonnet) y **reutiliza** la infra de límites ya en producción. La secuencia correcta: **Ola 1 determinista y barata** primero; el **coach con memoria** (lo caro y lo diferenciador) en Ola 2 con las 4 capas + retrieval; **feedback diario a escala** en Ola 3 con cron+cola+push. Riesgo #1 real = **legal/clínico**, no técnico: gating conservador + revisión profesional antes de exponer condiciones médicas.
