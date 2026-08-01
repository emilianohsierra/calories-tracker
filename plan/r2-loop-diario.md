# R2 — Loop Diario (spec de producto)

**Autor:** Drucker (Head of Product) · Fecha: 2026-08-01 · **Reporta:** Lugia (mwao6a57)
**Rebanada 2** de `plan/vision-roadmap-priorizado.md` — el loop que retiene, ~$0 costo IA.
**Reusa (no re-deriva):** ciencia determinista de Karpathy — consejo del día (`ola1-formulas-coaches.md` §6), reporte semanal (§7), ajuste semanal (§5.1). UI/gamificación de Rams (`premium-vision-ux.md` §3). Navegación de `rediseno-producto-roadmap.md` §1.

> **Alcance de este doc:** el *producto* — qué vive el usuario, dónde en la UI, gating Free/Pro, estados, copy y métricas. La lógica de cálculo es de Karpathy (determinista); la IA solo redacta. **Cero cifras inventadas.**

---

## 0. Por qué R2 (la tesis)
El coach (R1) responde cuando lo abres. R2 hace que la app **te dé una razón diaria para volver** y un **valor semanal que justifica pagar mes a mes** — sin costo IA relevante (consejo fusionado con AM ≈ $0 extra; reporte ~$0.018/mes). Es lo que sube **D7** y baja **churn**. Tres piezas que forman un solo loop:

```
Mañana: CONSEJO DEL DÍA (razón para abrir) →
  registrar comidas durante el día (loop de R1) →
  RACHA +1 al cerrar el día →
  Domingo: REPORTE SEMANAL ("tu coach revisó tu semana") →
  lunes: el consejo refleja el reporte → repite
```

---

## 1. Consejo del día

**Qué es (producto):** una tarjeta corta (1-2 frases) en **HOY**, arriba, personalizada con los datos del usuario. Es el "saludo del entrenador" que abre el loop.

- **Cuándo:** una vez al día, generado en la **misma llamada AM** que el feedback (costo extra ≈ 0, Karpathy §6). Determinista la *selección del foco*; IA solo *redacta* en el tono elegido.
- **Dónde:** widget 2 de HOY (bajo el héroe de anillos), junto al estado de racha. No es pantalla aparte.
- **Contenido:** foco elegido por reglas deterministas (hidratación, macro pendiente, favorito, hábito, timing de entreno, progreso…), sin repetir foco en 14 días (Karpathy §6).
- **Estados:**
  - *Normal:* tarjeta con el consejo + micro-CTA opcional ("Registrar agua", "Ver mi progreso").
  - *Sin datos aún* (usuario nuevo): consejo de bienvenida/genérico por objetivo — **nunca** tarjeta vacía.
  - *Compartible:* botón discreto "Compartir" → tarjeta bonita **SIN PII** (nada de nombre/peso/salud; solo el tip + branding). Coordinar con Rams. Este es el candidato viral (validar con tasa de compartidos, no darlo por hecho).

**Free vs Pro:**
- **Free:** consejo **semi-genérico por objetivo** (no toca datos finos → $0 marginal, y da un gancho de valor).
- **Pro:** consejo **personalizado** con progreso, comida de ayer y entreno de hoy.

**Copy (ejemplos de tono, IA los genera; NO hardcodear cifras):**
- Motivador: "Vas con 5 días de racha 🔥 hoy una cena con proteína cierra tu meta."
- Sereno: "Un vaso de agua ahora te acerca a tu meta de hidratación. Sin prisa."
- (El tono sale de la personalidad del coach; §7.2 de `rediseno-producto-roadmap.md`.)

---

## 2. Reporte semanal de insights

**Qué es (producto):** el momento "mi coach revisó mi semana". 1-3 insights accionables + 1 foco de la semana, **basados en métricas deterministas** (adherencia, cumplimiento de proteína, tendencia de peso, racha — Karpathy §7).

- **Cuándo:** semanal (domingo PM o 7 días desde el alta). Detección 100% determinista; IA solo redacta los insights.
- **Dónde:** aparece en **HOY** como tarjeta destacada el domingo/lunes + entrada permanente en **PROGRESO**. Si hay proactividad (R3), también dispara notificación; en R2 vive in-app (feed/tarjeta).
- **Contenido (estructura de Karpathy §7):** `{ métricas, ajuste_propuesto (máx 1, con su porqué), insights[1-3], foco_semana }`. El ajuste explicado ("subo tus carbos porque…") es clave: es el coach que **recalibra por ti** → anti-churn.
- **Estados:**
  - *Semana con datos:* reporte completo.
  - *Adherencia baja (<70%):* el insight NO recorta kcal; empuja el hábito de registrar (regla de Karpathy §5.1) — tono amable, nunca culpa.
  - *Datos insuficientes* (usuario muy nuevo): mini-reporte de bienvenida + qué registrar para el próximo.

**Free vs Pro:**
- **Free:** ❌ (teaser: "Tu reporte semanal te espera en Pro").
- **Pro:** ✅ completo, con ajuste explicado.
> Es un ancla Pro fuerte: el valor recurrente que hace sentir que los $99/mes "trabajan" cada semana.

---

## 3. Rachas

**Qué es (producto):** racha de **registro/hábito** (no de dieta). Premia consistencia, nunca restricción. Motor de retención + parte del costo emocional de irse.

- **Regla:** cuenta días consecutivos con registro (o con día cerrado en meta — decidir con Karpathy cuál dispara; recomiendo **registro**, más inclusivo y sano).
- **Día comodín / racha congelada:** 1 día de gracia para no destruir semanas por un tropiezo (estilo Duolingo). **Clave anti-ansiedad y retención.**
- **Nunca** se rompe por "comer de más" — eso sería dañino y ahuyenta. Se rompe solo por **no registrar** más allá del comodín.
- **Dónde:** resumen (número + llama) en HOY (widget 2, junto al consejo); detalle e historial en PROGRESO.
- **Celebración:** hitos (7/14/30 días) con toast breve (respeta `prefers-reduced-motion`). Sin confeti invasivo.

**Free vs Pro:**
- **Free:** rachas + logros básicos (es retención para todos, **no** debe ir tras el muro).
- **Pro:** + retos exclusivos (los retos mensuales temáticos son R2/posterior; el core de racha es gratis).

---

## 4. Gating Free vs Pro — resumen R2

| Pieza | FREE | PRO |
|---|---|---|
| Consejo del día | semi-genérico por objetivo | personalizado con tus datos |
| Reporte semanal | ❌ (teaser) | ✅ completo + ajuste explicado |
| Rachas + logros básicos | ✅ | ✅ |
| Retos exclusivos | ❌ | ✅ |

Principio: lo que **instala el hábito** (consejo básico + racha) es gratis para maximizar retención y boca-a-boca; lo que **acompaña y recalibra** (reporte + ajuste + consejo personalizado) es Pro. Coherente con "vender tranquilidad".

---

## 5. Dependencias y datos (para CTO)
- **Fuente de verdad:** `meals` (día), `nutrition_targets` (objetivo), `daily_snapshots`/medias móviles (tendencia), `streaks`. **Cero IA para detectar**; IA solo redacta (Haiku, tono del perfil).
- **Consejo del día:** fusionar con la generación AM (1 llamada, contexto cacheado) → $0 extra. Guardar `foco` elegido en `tips_recientes[14d]` para no repetir.
- **Reporte semanal:** job semanal (o cálculo on-open el domingo) que corre las métricas deterministas §7 de Karpathy y una llamada Haiku para redactar. ~$0.018/mes.
- **Rachas:** derivadas de registros; lógica de comodín en código. Persistir racha actual + máxima + estado de comodín.
- **Guardrail:** si la IA emite una cifra que no viene del motor determinista, se ignora en UI (regla de Karpathy §8).

## 6. Métricas de éxito (día 1)
- **Retención D7 ≥25%** (¿instalamos el loop?).
- **% de días con registro** al alza (frecuencia del loop).
- **% de usuarios que abren el reporte semanal** (valor percibido de Pro).
- **Tasa de compartidos del consejo del día** por usuario activo (validación del gancho viral — decide si se invierte más).
- Vigilar **churn de Pro <8%** una vez R2 esté vivo (el reporte semanal es el principal argumento de "sigue valiendo el mes").

## 7. Qué NO incluye R2 (evitar scope creep)
- ❌ Notificaciones push del consejo/reporte → eso es **R3** (proactividad). En R2 vive **in-app**.
- ❌ Retos mensuales complejos con motor propio → versión mínima; los temáticos completos son posteriores.
- ❌ Dashboard de micronutrientes / planes de comida → fases posteriores.
- ❌ Cualquier cifra generada por IA sin respaldo del motor determinista.

---

## Handoffs
- **Karpathy:** R2 reusa tus §5.1/§6/§7 tal cual; confirma el disparador de racha (registro vs día-en-meta — recomiendo registro) y el formato del `foco_semana`.
- **Rams:** widget de consejo+racha en HOY (widget 2), tarjeta compartible sin PII, tarjeta de reporte semanal en HOY y su detalle en PROGRESO, celebración de hitos con reduced-motion.
- **Casey/Copy:** teaser del reporte para Free ("Tu reporte semanal te espera en Pro") alineado con el paywall.
- **Lugia:** R2 es barata (~$0 IA) y de alta palanca de retención; va **después** de R1 (coach vivo y cobrable). Reporto (1) paywall completo; este es el (2).

## TL;DR
R2 = **consejo del día** (razón diaria para abrir, $0 extra) + **reporte semanal** (el "mi coach revisó mi semana" con ajuste explicado = ancla Pro) + **rachas con día comodín** (retención sin ansiedad). Todo sobre datos **deterministas** (IA solo redacta). Free = consejo básico + racha (instala hábito, gratis); Pro = consejo personalizado + reporte completo (acompaña, recalibra). Notificaciones NO entran aquí (son R3). Métrica que manda: D7 y % días con registro.
