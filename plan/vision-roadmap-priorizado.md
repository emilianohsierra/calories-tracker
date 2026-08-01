# Visión → Roadmap Priorizado (para green-light de Emiliano)

**Autor:** Head of Product (Drucker) · Fecha: 2026-07-31 · **Reporta:** Lugia (mwao6a57)
**No es rediseño de cero.** Prioriza sobre lo ya vivo/planeado. Fuentes leídas: `plan/coach-arquitectura.md`, `plan/coach-cerebro.md`, `plan/coach-ui-spec.md`, `plan/ola1-formulas-coaches.md`, `plan/rediseno-producto-roadmap.md`, `plan/coach-producto.md`, `plan/consistencia-premium-app.md`.

> **Filtro maestro (aplica a todo):** *"¿esto hace sentir un entrenador + nutriólogo + coach de nivel pro en el bolsillo Y empuja la conversión a Pro?"* Si no cumple **ambas**, no entra en la columna vertebral.

## Estado vivo (punto de partida — NO reconstruir)
- ✅ **Motor determinista con 5 coaches no-médicos** (pérdida de grasa, hipertrofia, runner, bienestar, recomposición), fórmulas verificadas contra código (`ola1-formulas-coaches.md`).
- ✅ **Coach IA con tool-use (5 acciones)** + onboarding + perfil + plan calculado, vivos.
- ✅ **Rediseño premium** (sistema de diseño teal + dark) cerrado; migración por pantalla en curso.
- ✅ **Stripe Pro $99 MXN validado en test**.
- 🔶 **Memoria (4 capas)** diseñada, **por deployar**. Consejo del día + reporte semanal **especificados**, no construidos.
- 🔶 **Proactividad + notificaciones (Fase 2)** diseñada, no construida.

---

## (1) Columna vertebral — 3 rebanadas de mayor palanca, en orden de construcción

Regla: cada rebanada es **lanzable, cobrable/medible y reusa lo vivo**. Sin hervir el océano.

### 🥇 Rebanada 1 — "El coach vivo y cobrable" *(el mayor apalancamiento; casi todo ya existe)*
**Qué:** deployar la **memoria** + activar el **chat coach Pro-gated** (degustación Free) + **paywall honesto** (rediseño de `UpgradeModal`, copy ya cerrado conmigo).
**Por qué es #1:** el "nutriólogo en el bolsillo" **ya funciona** (chat con contexto + 5 tool-actions). Falta *encenderlo como producto de pago* y darle memoria para que se sienta que *te conoce*. Convierte porque: la degustación engancha, el muro aparece **sobre valor ya demostrado** (no sobre promesa), y Stripe ya está validado. **Máximo valor percibido / mínimo esfuerzo nuevo.**
**Incluye:** deploy memoria (L1-L4) · gate Pro en `/api/coach/chat` (degustación Free 3 msg/mes) · `UpgradeModal` premium con copy "vender tranquilidad" · verificación de la migración visual premium en las pantallas del flujo de pago.
**Métrica de éxito:** conversión Free→Pro ≥3% y **≥1 conversación de coach por usuario activo/semana**.

### 🥈 Rebanada 2 — "El loop diario que retiene" *(casi $0 de costo IA, ya especificado)*
**Qué:** **consejo del día** (fusión AM, ~$0 extra) + **reporte semanal de insights** + **rachas** (con día comodín).
**Por qué es #2:** instala el hábito diario y da el **valor recurrente que justifica pagar mes a mes** (el reporte es "mi coach revisó mi semana"). Es lo que sube D7 y baja churn. Barato y ya diseñado por Karpathy (§6-7 de `ola1-formulas-coaches.md`).
**Incluye:** consejo del día en HOME (personalizado, sin PII en la versión compartible) · reporte semanal (detección determinista, IA solo redacta) · rachas visibles.
**Métrica de éxito:** **retención D7 ≥25%** y **% de días con registro** al alza.

### 🥉 Rebanada 3 — "El coach que te busca" *(anti-churn real; más pesado → después de validar 1-2)*
**Qué:** **proactividad Fase 2** — motor de eventos deterministas + web push + **anti-spam adaptativo** + modos (tranquilo/normal/entrenador).
**Por qué es #3 (no #1):** es el foso de retención ("no cancelo porque perdería a quien me busca cada día"), pero es la rebanada **más cara y frágil** (Vercel Cron, web push, iOS, cola). **Regla:** no invertir aquí hasta que las rebanadas 1-2 muestren que la conversación *vale* — proactividad sobre un coach mediocre es spam que destruye confianza. Ya diseñada en `coach-arquitectura.md` §2-3.
**Métrica de éxito:** **churn mensual de Pro <8%** y **tasa de apertura útil** de notificaciones (nudge→acción), no volumen enviado.

> **Soporte transversal (no es rebanada propia, entra con 1-2):** cerrar la migración visual premium (P0/P1 de `consistencia-premium-app.md`) — dark roto + des-emojificar HOME/registro. Alto impacto en "feel pro", bajo riesgo (solo CSS/markup).

**Lo que deliberadamente NO está en la columna vertebral (para no hervir el océano):** planes de comida completos, dashboard de micronutrientes, voz, barcode, modo precisión Sonnet. Todos son *después*; ninguno es requisito para que se sienta coach pro ni para cobrar.

---

## (2) Coaches: cuáles lanzar primero — **corrijo la hipótesis**

**Hipótesis de Lugia:** lanzar Hipertrofia + Pérdida de grasa + Runner (reusan el motor determinista); diferir médicos.
**Corrección (basada en el estado vivo):** el motor determinista **ya tiene 5 coaches no-médicos construidos y verificados**, no 3. Sumar Bienestar y Recomposición cuesta **~$0 marginal** (mismas fórmulas puras) y **amplía el mercado** sin riesgo legal. Lanzar solo 3 sería dejar valor ya pagado en la mesa.

**Decisión recomendada:**
- **Lanzar YA (Ola 1, riesgo nulo, ya codificados):** **Pérdida de grasa · Hipertrofia · Runner · Bienestar · Recomposición.** Los tres primeros son la demanda #1 del mercado; **Bienestar** es la red amplia (capta al que "solo quiere comer mejor"); **Recomposición** resuelve el clásico "grasa + músculo a la vez" sin objetivos contradictorios.
- **Después (riesgo medio, expansión barata):** más deportes (ciclismo, triatlón, fuerza/CrossFit) + **estilos de dieta como overlay** (keto, vegana, vegetariana, alta proteína, mediterránea) — se combinan con cualquier objetivo, sin contradicción calórica. Regla del motor: **1 objetivo calórico × N dietas × 1 tono**.
- **DIFERIR (riesgo legal alto — confirmo la hipótesis de Lugia):** **coaches médicos y etapas de vida sensibles** — Diabetes, Hipertensión, colesterol/renal, **Embarazo/Lactancia, Infantil, Adulto Mayor**. Solo tras: T&C + consentimiento revisados por abogado, validación de nutriólogo colegiado, y **modo conservador** (registro + educación general, sin prescripción, disclaimers reforzados). Embarazo/lactancia/infantil y renal/diabetes T1 son **los últimos de todos**.

**Por qué diferir médicos es correcto, no cobardía:** un mal consejo a un diabético o embarazada es daño real + demanda; el motor determinista actual no está calibrado ni validado para terapéutica. El riesgo legal supera con creces la demanda incremental hoy. Se lanzan cuando el blindaje exista, no antes.

---

## (3) Monetización — vender TRANQUILIDAD, no funciones (sin dark patterns)

**Marco:** Free = **la herramienta**; Pro = **el acompañamiento** (alguien se ocupa de que llegues a tu meta). El copy del paywall vende la promesa, no la lista.

| Eje | FREE | PRO — $99 MXN/mes |
|---|---|---|
| **Coaches** | Elegir 1 objetivo + plan calculado | Los 5 + cambiar de objetivo/dieta cuando quiera |
| **Coach IA (chat)** | Degustación 3 msg/mes | **Ilimitado** (corazón de Pro) |
| **Proactividad + notificaciones** | recordatorio simple | ✅ inteligentes (Rebanada 3) |
| **Análisis por foto** | 10/mes | Ilimitado + reanálisis con corrección |
| **Consejo del día** | ✅ (semi-genérico) | ✅ personalizado con tus datos |
| **Reporte semanal + ajuste explicado** | ❌ | ✅ |
| **Dashboard** (tendencias, adherencia, peso) | 7 días básico | Histórico completo |
| **Gamificación** | rachas + logros básicos (todos) | + retos exclusivos |
| **Memoria** (te recuerda, "mis platillos") | hasta 10 platillos | ilimitada — *el costo de cambio* |

**Reglas anti-dark-pattern (regla del proyecto):**
- El registro manual **siempre gratis e ilimitado** — el muro bloquea una comodidad, nunca la función core.
- Muro **después** de mostrar valor (post-plan calculado, post-resultado), nunca antes.
- Copy `limit` empático, no punitivo ("ya usaste tus 10", no "te quedaste sin"), con salida gratis visible.
- Al cancelar: **mantiene Pro hasta fin de periodo, nunca borra datos**, y se ofrece **pausar** en vez de cancelar. Cierre neutro ("Ahora no", no "prefiero seguir limitado").
- **Anual solo cuando el `price_id` esté cobrable en Stripe**; no mostrar $799/año si aún no se puede cobrar. Toggle honesto (default mensual, el usuario elige el anual).

**Por qué esto sostiene el negocio:** lo que se pierde al cancelar no es una función, es **la relación** (el coach que te conoce, tu memoria, tu racha). Eso es el anti-churn — *"no cancelo porque perdería a mi entrenador"* hecho mecánica de producto.

---

## (4) Diferenciadores MEDIBLES vs MyFitnessPal

| Dimensión | MyFitnessPal | Nosotros | Métrica de la ventaja |
|---|---|---|---|
| **Registro** | Búsqueda manual en BD gigante (lento, tedioso) | Foto + texto ("2 tacos de pastor") con IA | **Tiempo por registro** (<15s vs ~60s) y **registros/día por usuario** |
| **Comida latina** | BD gringa, porciones que no aplican | Motor + prompt sesgado a comida mexicana | **% de platillos reconocidos sin corregir** en menú latino |
| **Acompañamiento** | Muestra datos; no te habla | Coach que **actúa** (chat + proactividad + ajuste explicado) | **Conversaciones coach / usuario activo** y **% registros que generan interacción** |
| **Idioma/cercanía** | Español mediocre, tono neutro | Español nativo + 5 personalidades | **Retención D7/D30** del segmento hispano |
| **Precio** | ~$20 USD/mes | $99 MXN (~$5 USD) | **Conversión Free→Pro** a precio local |

**Titular medible:** en registro latino esperamos **menor tiempo por registro, mayor tasa de reconocimiento sin corrección y más interacción diaria con el coach** que MFP. Esas 3 son la prueba objetiva de "coach que actúa + entiende tu comida".

---

## (5) Riesgos de producto y qué NO construir aún

**Riesgos (con mitigación ya diseñada):**
| # | Riesgo | Mitigación |
|---|---|---|
| R1 | **Costo IA se dispara** (chat/power-users) | ledger por-feature + caps + Haiku + prompt caching + airbag/kill-switch (ya en `coach-arquitectura.md` §6) |
| R2 | **Spam de notificaciones → churn** | anti-spam adaptativo + modos + quiet hours + degradación por engagement (Rebanada 3) |
| R3 | **Riesgo legal/clínico** | coaches médicos **diferidos** tras blindaje legal; el resto es no-médico |
| R4 | **IA inventa cifras** | la IA solo redacta sobre el motor determinista; cifra fuera del motor se ignora en UI |
| R5 | **Push poco fiable (iOS)** | requiere PWA instalada; **fallback siempre al feed in-app** |
| R6 | **Datos de salud sensibles** | RLS en todo, minimizar, consentimiento; `service_role` solo-webhook |

**Qué NO construir aún (foco de equipo de 1-2):**
- ❌ **Coaches médicos y etapas sensibles** — hasta tener blindaje legal/clínico.
- ❌ **Proactividad/push antes de validar el chat** (Rebanada 3 no arranca hasta que 1-2 muestren retención).
- ❌ **Feed social / comunidad** — moderación cara, distrae del core, un equipo de 2 no lo sostiene.
- ❌ **Integración wearables** — mucho esfuerzo, no cambia el "feel coach".
- ❌ **Ayuno intermitente como módulo ancla** — dejarlo como overlay de dieta, no feature propia.
- ❌ **Dashboard de micronutrientes, planes de comida completos, voz, barcode, modo Sonnet** — todo *después* de la columna vertebral; ninguno es requisito para cobrar.

---

## TL;DR para green-light
**Columna vertebral (3 rebanadas, en orden):** (1) **coach vivo y cobrable** — deploy memoria + chat Pro-gated + paywall honesto (casi todo ya existe, Stripe validado); (2) **loop diario** — consejo del día + reporte semanal + rachas (≈$0 costo, ya specced, sube D7); (3) **proactividad/notificaciones** — el anti-churn, pero solo tras validar 1-2. **Coaches:** lanzar los **5 no-médicos ya construidos** (corrijo: son 5, no 3 — Bienestar y Recomposición son gratis de sumar), diferir **médicos y etapas sensibles** tras blindaje legal (confirmo la hipótesis). **Monetización:** vender tranquilidad, Free=herramienta / Pro=acompañamiento, sin dark patterns, memoria como costo de cambio. **Diferenciador vs MFP:** coach que actúa + comida latina + registro por foto/texto, medible en tiempo de registro, reconocimiento sin corrección e interacción diaria. **No construir aún:** médicos, proactividad prematura, social, wearables, micros/planes/voz.
