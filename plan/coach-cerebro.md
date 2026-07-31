# El Cerebro del AI Personal Nutrition Coach

**Autor:** Karpathy AI-Nutri (AI Product Designer + nutricionista deportivo)
**Para:** Lugia (mwao6a57) · Coordinación: Torvalds/CTO (gkmi48v7, arquitectura), Rams (skm3lj3d, UI)
**Base:** `plan/rediseno-coach-ia.md`, `plan/ola1-formulas-coaches.md`. **Fecha:** 2026-07-31

> **Principio rector:** el cerebro es **determinista en la decisión, IA en la redacción**. Los *triggers* de cada evento, los umbrales y la selección de datos son reglas fijas (0 IA). La IA solo **redacta** el mensaje con el tono elegido, anclado en números que ya calculó el motor (`plan/ola1-formulas-coaches.md`). Nunca inventa cifras; si emite una que no viene del motor, la UI la ignora. Límite legal invariante: **informa/organiza/motiva, NO diagnostica ni modifica tratamientos** (§2).

---

## 1. Objeto de contexto / memoria (canónico)

Se ensambla en cada interacción y va en el **system prompt cacheado** (clave del costo, §7). Es la fuente de "sabe todo de mí". Tres capas: **perfil** (estable) · **estado** (dinámico diario) · **memoria** (resumen curado).

```jsonc
{
  // PERFIL (cambia poco)
  "identidad": { "nombre":"", "sexo":"", "edad":0, "altura_cm":0 },
  "antropometria": { "peso_kg":0, "peso_objetivo_kg":0, "grasa_pct":null, "cintura_cm":null },
  "objetivo": { "coach":"perdida_grasa|hipertrofia|recomposicion|runner|bienestar", "fecha_meta":null },
  "metas": { "kcal":0, "prot_g":0, "carb_g":0, "gras_g":0, "fibra_g":0, "agua_ml":0 },  // del motor
  "dieta": { "estilos":[], "presupuesto":"", "tiempo_cocina_min":0, "dificultad":"" },   // eje aparte
  "restricciones_duras": { "alergias":[], "intolerancias":[], "celiaquia":false, "no_consume":[] }, // NUNCA violar
  "preferencias": { "favoritos":[], "rechazos":[], "cocina":"mexicana", "pais":"MX" },
  "horarios": { "desayuno":"08:00", "comida":"14:30", "cena":"20:30", "entreno":[], "fuente":"onboarding|aprendido" },
  "salud": { "condiciones":[], "lesiones":[], "medicacion_declarada":[] },   // dispara §2 guardrails
  "entrenamiento": { "deporte":"", "dias_semana":0, "sesiones":[] },
  "personalidad": "amigable|entrenador|analitico|tranquilo",

  // ESTADO (dinámico, hoy)
  "hoy": { "kcal":0, "macros":{}, "pendientes":{}, "agua_ml":0, "comidas":[], "entreno":null, "hora_local":"" },
  "tendencias": { "peso_media7d":0, "delta_sem":0, "adherencia_pct":0, "prot_cumplida_dias":0,
                  "racha_registro":0, "agua_media_pct":0 },
  "proximo": { "comida":{ "tipo":"", "hora":"" }, "entreno":null, "competencia":null },

  // MEMORIA (resumen curado; §3 del rediseño)
  "memoria": { "hechos_clave":[], "resumen_conversacion":"", "compromisos_abiertos":[],
               "tips_focos_14d":[], "eventos_enviados_hoy":[] }
}
```

### Cómo aterriza CADA respuesta (regla dura)
Ninguna respuesta genérica. Toda salida usa el objeto:
- *"¿Qué ceno?"* → `hoy.pendientes` + `preferencias.favoritos` + `restricciones_duras` + `horarios.cena` → opción concreta que **cierra** el día, con kcal/macros, respetando alergias/no_consume.
- *"¿Voy bien?"* → `tendencias` vs ritmo objetivo del coach → veredicto + 1 acción.
- Siempre: español, números del usuario, **una acción en 1 tap** (registrar / ver sugerencia / replanear).

---

## 2. Comportamiento por perfil + guardrails médicos

Mismo motor y contexto; el **coach** define qué prioriza y qué vigila. En Ola 1 los 5 son **no médicos**.

| Coach | Prioriza | Nudges propios | Nunca |
|---|---|---|---|
| **Runner** | rendimiento, carbos peri-entreno, hidratación/electrolitos | pre/post entreno, carga pre-carrera, hidratación en tiradas | déficit agresivo en bloque de entreno |
| **Pérdida de grasa** | déficit sostenible, proteína, saciedad | proteína pendiente, adherencia, tendencia | empujar por debajo del piso o >1%/sem |
| **Hipertrofia** | superávit controlado, proteína, progresión | proteína, carbos peri-entreno, ganancia sana | superávit que dispare grasa |
| **Recomposición** | mantenimiento±, proteína alta 2.2 g/kg, fuerza | proteína alta, consistencia, fuerza | prometer resultados rápidos; déficit >10% |
| **Bienestar** | hábitos (agua, verdura, menos ultraprocesados) | agua, verdura, racha | conteo obsesivo; déficit no pedido |

**Guardrails médicos (invariantes, aplican a TODOS los tonos y coaches):** el coach es **apoyo educativo y de organización**. **NO** diagnostica, **NO** prescribe, **NO** ajusta medicación ni tratamientos, **NO** fija objetivos clínicos (glucosa/tensión). Ante síntomas, medicación o petición terapéutica → **deriva a profesional sanitario** con disclaimer. Restricciones duras (alergias/celiaquía/no_consume) = **filtro en código**, nunca solo en prompt. Coaches clínicos y de etapas **NO entran en Ola 1** (ver `plan/rediseno-coach-ia.md` §7). Ningún tono (§6) relaja esto.

---

## 3. Motor de eventos (proactividad) — el corazón del cerebro

Cada evento = **trigger determinista** (condición + datos) → **decisión** (¿disparar? dedupe, quiet hours, cap diario) → **redacción** (IA con tono, o plantilla 0-IA) → **acción ofrecida**. `memoria.eventos_enviados_hoy` evita repetir; **horas de silencio** (p. ej. 22:00–07:00) y **cap** (máx 3–4 proactivos/día) protegen UX y costo (§7).

**Columna "gen":** `plantilla` = string determinista con slots, **0 IA** · `IA` = redacción personalizada · `híbrido` = plantilla que la IA puede enriquecer.

| Evento | Trigger (determinista) | Datos | Mensaje (ejemplo) | Acción | gen |
|---|---|---|---|---|---|
| **meal_time** | hora_local ∈ ventana de una comida (horarios) Y esa comida no registrada | pendientes, favoritos, coach | "Casi hora de comer. Te quedan 620 kcal y 40 g de proteína — unos tacos de pollo con verdura te cuadran. ¿Te los registro?" | Ver sugerencia · Registrar | IA |
| **missed_meal** | ventana de comida pasó > 60–90 min sin registro | qué comida, pendientes | "¿Comiste ya? Si sí, regístralo para no perder tu meta; si no, te ayudo con algo rápido." | Registrar · No comí | híbrido |
| **low_protein** | hora ≥ 18:00 Y prot cumplida < 60% del objetivo | prot pendiente, fuentes según dieta | "Vas corto de proteína hoy (65/140 g). Un yogur griego + atún lo cierran. ¿Lo sumo?" | Ver opciones · Registrar | IA |
| **low_hydration** | hora ≥ 17:00 Y agua < 60% objetivo | agua pendiente | "Llevas 1.1 de 2.5 L. Un par de vasos en la tarde y llegas." | +1 vaso · +500 ml | plantilla |
| **workout_approaching** | proximo.entreno dentro de 2–3 h | tipo entreno, timing carbos pre | "Entrenas en 2 h. Come algo con carbos ~1 h antes (fruta + avena) para llegar con energía." | Ver snack pre · Ok | híbrido |
| **workout_completed** | entreno marcado hecho (o detectado) | ventana post, pendientes | "¡Buen entreno! Ventana de recuperación: ~20 g de proteína + carbos. Un licuado o pollo con arroz." | Registrar comida post | IA |
| **goal_progress** | hito de tendencia (p. ej. −1 kg media7d, o % de meta) | delta peso, % avance | "Media de peso bajando: −1.2 kg en 3 semanas, justo en ritmo. Sigue así." | Ver progreso | híbrido |
| **streak** | racha_registro alcanza 3/7/14/30 | racha | "¡7 días seguidos registrando! Ahí se construyen los resultados." | Ver racha | plantilla |
| **weekly_review** | semanal (domingo PM o +7 días) | métricas + 1 ajuste (§7 ola1) | "Semana 88/100: proteína y calorías en meta, faltó agua. Te propongo mantener kcal y subir a 2.5 L." | Ver reporte · Aplicar | IA |
| **unusual_behavior** | patrón atípico: bajada >1%/sem, salto de kcal, o varios días muy por debajo del objetivo | señal detectada | "Noté que bajaste rápido esta semana. No pasa nada, pero ajustemos para que sea sostenible." (si señal médica → deriva) | Ver ajuste · Estoy bien | IA |
| **user_inactivity** | N días (p. ej. 3) sin abrir/registrar | días inactivo, último objetivo | "Te extrañé por aquí. Retomar hoy es fácil — ¿registramos algo rápido?" | Registrar · Ajustar metas | híbrido |

**Ejemplos del brief (mapeados):** pre-desayuno/comida/cena = `meal_time` por ventana; pre-entreno = `workout_approaching`; post-entreno = `workout_completed`; hidratación = `low_hydration`; resumen nocturno = feedback PM (fusionable con `weekly_review`/consejo del día). Todos leen `memoria` para **no repetir** y **referenciar el pasado** ("hace 3 semanas no llegabas a 120 g de proteína…").

**Fusión para ahorrar (crítico, §7):** el **feedback AM** (plan del día) puede empaquetar en UNA sola llamada de IA: saludo + `meal_time` del desayuno + `consejo del día` + `workout_approaching` si aplica. El **feedback PM** empaqueta: resumen + puntuación + `low_protein`/`low_hydration` no resueltos + objetivo de mañana. Así los eventos "de reloj" no multiplican llamadas.

---

## 4. Horarios inteligentes (preguntar + aprender)

**Onboarding:** pedir horarios típicos (desayuno/comida/cena/entreno) → `horarios.fuente = 'onboarding'`.
**Aprendizaje (determinista, 0 IA para detectar):** de los timestamps de comidas registradas, calcular la **mediana rodante** por tipo de comida sobre los últimos N días con datos.

```
function aprende_horario(tipo, logs_ultimos_21d):
    horas = [hora_de(log) for log in logs where log.tipo == tipo]
    if len(horas) < 5: return null                 // no hay señal suficiente
    mediana = mediana(horas)
    dispersión = IQR(horas)
    if dispersión < 90 min:                          // patrón consistente
        return { hora: mediana, confianza: 'alta' }
    return { hora: mediana, confianza: 'baja' }

// Si el aprendido difiere del onboarding > 45 min y confianza alta:
//   → proponer (NO imponer): evento de confirmación.
```
**Confirmación al usuario (una vez, no intrusiva):** *"Sueles desayunar cerca de las 8:00 — ¿ajusto tus recordatorios a esa hora?"* → Sí (fija `fuente='aprendido'`) / No (mantiene onboarding). Las ventanas de `meal_time` (§3) usan el horario efectivo ± tolerancia (p. ej. ±45 min).

---

## 5. Chat contextual desde notificación (deep-link)

Cada notificación proactiva lleva su **contexto de evento** (tipo + datos que la dispararon). Al abrir el chat desde ella, el **primer mensaje del coach explica por qué llegó**, sin que el usuario tenga que preguntar:

- Desde `low_protein`: *"Te escribí porque son las 7 de la tarde y llevas 65 de tus 140 g de proteína. Te propongo un yogur griego y atún para cerrarlo — ¿lo registro o prefieres otra cosa?"*
- Desde `workout_approaching`: *"Entrenas en un par de horas; te sugiero un snack con carbos ~1 h antes. ¿Te doy opciones según lo que tengas?"*
- Desde `meal_time`: *"Es tu hora de comer y aún no registras nada. Con lo que te queda hoy, unos tacos de pollo con verdura cuadran. ¿Vamos con eso?"*

Implementación: la notificación abre el chat con un **payload de evento**; el backend inyecta `{evento, datos}` en el contexto y genera el primer turno. A partir de ahí, chat normal (streaming) con el objeto de contexto completo.

---

## 6. Las 4 personalidades (capa de tono)

El usuario elige **una** personalidad. Es un **overlay de tono**: cambia *cómo se dice*, **nunca la ciencia, los números ni los guardrails** (§2). Se implementa como un bloque corto de instrucción intercambiable en el prompt (costo ≈ 0, cacheado).

| Personalidad | Voz | Ejemplo ("te faltan 25 g de proteína") |
|---|---|---|
| **Amigable** | cálida, cercana, celebra | "¡Casi lo tienes! Solo 25 g de proteína; unos huevos con la cena y cierras un gran día." |
| **Entrenador** | retadora, empuja disciplina | "Te faltan 25 g y hoy no se quedan. Huevos o pollo, tú eliges — pero se cierran." |
| **Analítico** | números, tendencias | "Proteína 115/140 g (82%). Media 7d 88%. +25 g = 130 g de pechuga → 100% y racha 11 días." |
| **Tranquilo** | sin presión, empática | "Vas bien. Si te apetece, 25 g más redondean el día; si no, mañana seguimos." |

*(Mapea a los 5 tonos de `plan/rediseno-coach-ia.md` A2; el brief consolida a 4 — el "profesional/técnico" se absorbe en Analítico.)*
**Regla dura:** ningún tono empuja déficits agresivos, presiona a un perfil sensible, ni omite disclaimers. El "Entrenador" motiva, no daña.

---

## 7. Costo de la proactividad + tácticas de margen

Referencia: `claude-haiku-4-5` (~$1/1M in, ~$5/1M out); 99 MXN ≈ $4.95. El objeto de contexto va **cacheado** (~0.1× en lecturas).

**Clave de diseño:** la **detección de eventos es 0 IA** (reglas). Solo la redacción cuesta, y varios eventos son **plantilla (0 IA)** o se **fusionan** en las 2 llamadas AM/PM.

| Concepto | Costo/uso | Volumen/mes | Costo/mes |
|---|---|---|---|
| Feedback AM (empaqueta saludo + meal_time desayuno + consejo del día + pre-entreno) | ~$0.004 | 30 | ~$0.12 |
| Feedback PM (resumen + puntuación + low_protein/hidratación + objetivo mañana) | ~$0.004 | 30 | ~$0.12 |
| Eventos IA sueltos (workout_completed, unusual_behavior, weekly_review) | ~$0.003 | ~12 | ~$0.036 |
| Eventos plantilla (low_hydration, streak) | $0 | — | $0 |
| Chat a demanda | ~$0.003 | ~120 | ~$0.36 |
| Análisis de foto | ~$0.003 | ~90 | ~$0.27 |

**Total proactividad + chat ≈ $0.90–1.0 USD ≈ 18–20 MXN/usuario/mes** (~20% del ingreso). Un power-user puede llegar a $3–4 (60–80 MXN) → el **chat** y los **eventos IA sin fusionar** son la variable a controlar.

**Tácticas de margen:**
1. **Triggers deterministas** = detección a 0 IA; solo redacta cuando el evento realmente dispara.
2. **Plantillas** para eventos simples (hidratación, racha) = 0 IA.
3. **Fusión AM/PM:** empaquetar los eventos "de reloj" en 2 llamadas/día (no una por evento).
4. **Cap diario** de proactivos (3–4) + **quiet hours** + **dedupe** (`eventos_enviados_hoy`).
5. **Prompt caching** del objeto de contexto y del prompt de dominio/tono.
6. **Resumen rodante** de memoria (no mandar transcript completo).
7. **Fair-use suave** por tier; Haiku por defecto; Sonnet/Opus solo como upsell "IA avanzada" Pro.

---

## Coordinación
- **CTO (gkmi48v7):** arquitectura del motor de eventos (scheduler/cron para triggers de reloj + evaluador de reglas al registrar comida/peso/entreno; tabla `eventos_enviados` para dedupe; quiet hours/cap; deep-link payload §5; aprendizaje de horarios §4 como job determinista; prompt caching y fusión AM/PM). Filtros duros de restricciones en código. La IA recibe números del motor (`ola1-formulas-coaches.md`), no recalcula.
- **Rams (skm3lj3d):** UI de notificaciones y del chat contextual (primer mensaje explica el porqué), selector de personalidad con preview, confirmación de horario aprendido (§4), tarjetas de acción (registrar/ver/aplicar), y visibilidad de disclaimers en cualquier mención de salud.

**Prioridad:** (1) objeto de contexto + chat con caching, (2) eventos de reloj fusionados en AM/PM + plantillas, (3) eventos por registro (low_protein, workout_completed) + dedupe/quiet hours, (4) aprendizaje de horarios + weekly_review, (5) unusual_behavior/inactivity + afinado de tono.
