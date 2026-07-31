# AI Personal Nutrition Coach — Diseño de Producto

**Autor:** Head of Product (Drucker) · Fecha: 2026-07-31
**Construye sobre:** `plan/rediseno-producto-roadmap.md` · **Integra:** Karpathy (motor/guardrails `plan/premium-vision-nutricion-ia.md`), Rams (UX `plan/premium-vision-ux.md`)
**Reporta:** Lugia (mwao6a57)

> **Filtro maestro (se aplica a cada pieza):** *"¿esto hace que el usuario sienta que tiene un entrenador profesional en el bolsillo?"* Un entrenador real **te conoce, te habla, te busca en el momento justo y sabe cuándo callarse.** Si una pieza no aporta a ese sentimiento → se recorta. Marcado 🟢 aporta / 🟡 soporte / 🔴 recortar.

---

## La tesis en una línea
El chat es la **herramienta**; la **proactividad** es el producto. Un coach que solo responde cuando le preguntas es un buscador. Un coach que **te busca en el momento correcto** ("son las 8pm, te faltan 40g de proteína, cierra con esto") es un entrenador. Esa proactividad — bien dosificada — es **el corazón del valor Pro y del anti-churn**: *"no cancelo porque perdería a alguien que se ocupa de mí."*

---

## (1) Free vs Pro — dónde vive el coach

**Principio:** Free deja **probar la voz del coach** (para que enganche); Pro entrega **el coach que se ocupa de ti sin límite y por iniciativa propia**. La línea que separa: **reactivo y limitado = Free; proactivo e ilimitado = Pro.**

| Capacidad del coach | FREE | PRO ($99/mes) | Filtro |
|---|---|---|:--:|
| **Chat con contexto** (conoce tu perfil/progreso) | 3 mensajes/mes (degustación) | **Ilimitado** | 🟢 |
| **Personalidad/tono** | 1 tono (Sereno, default) | **5 tonos, cambio libre** | 🟢 |
| **Consejo del día** | ✅ (semi-genérico por objetivo) | ✅ personalizado con tus datos de ayer/hoy | 🟢 |
| **Acciones desde el chat** (registrar, replanear en 1 tap) | básicas | completas | 🟡 |
| **Coach PROACTIVO** (te busca sin que preguntes) | ❌ | ✅ **corazón de Pro** | 🟢 |
| **Notificaciones inteligentes** (recordatorios, nudges en momento justo) | recordatorio simple 1×/día opcional | ✅ inteligentes y personalizadas | 🟢 |
| **Ajuste semanal explicado** ("subo tus carbos porque…") | ❌ | ✅ | 🟢 |
| **Planes de comida** | ❌ (teaser) | ✅ | 🟡 |

**Por qué esta línea sostiene el negocio:** la degustación (3 msg + 1 tono + consejo del día) hace que el usuario **conozca a su coach** → engancha. Pero **la proactividad y el ilimitado son Pro** → es exactamente lo que se pierde al cancelar, y lo que no se puede replicar registrando a mano. El anti-churn no es una función escondida; es **la sensación de estar acompañado**, que solo Pro entrega.

---

## (2) Secuenciación en fases (equipo de 1-2, valor incremental)

### 🟢 FASE 1 — El coach que RESPONDE bien *(MVP del coach — Ola 2 del roadmap)*
Objetivo: un chat que ya *se siente* un entrenador porque **te conoce y actúa**, no un ChatGPT genérico.

| Pieza | Qué es | Filtro | Esfuerzo |
|---|---|:--:|:--:|
| **Chatbox con contexto** | Inyecta el perfil compacto de Karpathy (§3.1: objetivo, TDEE, macros pendientes hoy, tendencia, intolerancias) en cada respuesta | 🟢 | M |
| **Acciones en 1 tap** | El coach no solo dice; ofrece "Registrar esto" / "Replanear mi día" / "Ver mi progreso" como botones | 🟢 | M |
| **Personalidad (5 tonos)** | Misma info, distinta voz; se elige en onboarding, default Sereno | 🟢 | B |
| **Guardrails** | Karpathy §3.3/§5: ámbito nutrición, no médico, sin extremos, respeta restricciones duras | 🟡 (no negociable) | M |

**Definición de "hecho" Fase 1:** el usuario pregunta "¿qué ceno?" y recibe una respuesta con **sus números**, un plato concreto de comida latina que **cierra su día**, y un botón para registrarlo. Eso ya pasa el filtro maestro. **Esto es el MVP cobrable del coach.**

### 🟡 FASE 2 — El coach que TE BUSCA *(proactividad — Ola 2-3)*
Objetivo: pasar de "está ahí si lo abro" a "se ocupa de mí". **Aquí nace el anti-churn real.**

| Pieza | Qué es | Filtro | Esfuerzo |
|---|---|:--:|:--:|
| **Proactividad basada en datos** | El coach detecta y actúa: "llevas 3 días sin registrar comida", "te falta proteína y son las 8pm", "vas a cumplir tu meta, ¡ánimo!" | 🟢 | M-A |
| **Notificaciones inteligentes** | Push/local en el **momento útil**, no por reloj fijo (ver §3-4) | 🟢 | M |
| **Horarios inteligentes** | Aprende tus horas de comida y registro; nudge antes de tu cena habitual, no a las 3pm | 🟢 | M |
| **Re-engagement de racha** | Aviso amable si la racha peligra (con día comodín) | 🟢 | B |

**Por qué en este orden:** Fase 1 primero porque **la proactividad sin un coach que responde bien es solo spam**. Un push que te lleva a un chat mediocre destruye confianza. Primero que la conversación valga, luego que te busque. Para un equipo de 2, Fase 1 es ~cerrable en un incremento; Fase 2 se parte en sub-entregas (primero notificaciones locales simples, luego horarios aprendidos).

**MVP vs después:**
- **MVP del coach = Fase 1 completa** (chat contextual + acciones + personalidad + guardrails). Ya justifica Pro.
- **Después = Fase 2** (proactividad + notificaciones + horarios). Es el *multiplicador* de retención, no el requisito para cobrar.

---

## (3) Inteligencia anti-spam + Modos — la feature que evita la desinstalación

**Insight de producto:** en apps de coach, **la notificación mal calibrada es la causa #1 de desinstalación.** "No molestar" no es una cortesía — es **retención directa**. Por eso el anti-spam es una *feature de primera clase*, no un ajuste escondido. Regla rectora: **cada notificación debe ganarse su lugar; ante la duda, no enviar.**

### Los 3 modos (elegibles + default inteligente)
| Modo | Frecuencia | Para quién | Tono |
|---|---|---|---|
| **Tranquilo** | Máx. 1 nudge/día, solo lo crítico (racha en riesgo, consejo del día) | El que se agobia; el que ya tiene el hábito | Suave, opcional |
| **Normal** (default) | 1-3/día en momentos útiles (recordar registrar, cerrar el día, celebrar) | La mayoría | Equilibrado |
| **Entrenador** | Proactivo y presente: nudges de comida, motivación, ajustes, retos | El que *quiere* que lo empujen (fitness, objetivos agresivos) | Directo, motivador |

- El modo se elige en onboarding con lenguaje humano ("¿Cuánto quieres que te empuje?") y se cambia en 1 tap desde el perfil o **desde cualquier notificación** ("¿demasiado? → Cambiar a Tranquilo").
- El **modo se alinea con la personalidad** (§7.2 del roadmap): "Entrenador" combina con tono Motivador/Directo; "Tranquilo" con Sereno.

### Reglas anti-spam (motor, dentro de cualquier modo)
1. **Tope duro por modo** (nunca superar, aunque haya "algo que decir").
2. **No repetir**: si no reaccionaste a un tipo de nudge 2 veces, ese tipo se silencia solo.
3. **Ventana de silencio**: nada en horas de sueño (aprendidas) ni si abriste la app hace <2h.
4. **Relevancia mínima**: solo se envía si hay un dato accionable *real* (no "¡hola!" vacío).
5. **Salida siempre visible**: cada push permite bajar de modo o silenciar ese tipo — reduce la fricción de "me molesta" a un tap, no a desinstalar.
6. **Preferir el consejo del día** como el único toque garantizado; el resto se gana por contexto.

**Filtro:** 🟢 — un buen entrenador **sabe cuándo callarse**. Los modos hacen que el usuario sienta control, no acoso → **no molesta = no desinstala = no cancela.**

---

## (4) Notificaciones proactivas como motor de retención (sin cruzar a molesto)

La proactividad es el **re-engagement diario** que instala el hábito. Cada notificación debe cumplir 2 pruebas: **(a) ¿es útil AHORA para el usuario?** y **(b) ¿un entrenador humano lo diría en este momento?** Si falla cualquiera, no se envía.

### Tipos de nudge útiles (no spam), ligados al loop diario
| Momento | Nudge | Por qué retiene (no molesta) |
|---|---|---|
| Mañana | Consejo del día | Da razón para abrir *antes* de comer; abre el loop |
| Antes de tu comida habitual | "¿Qué vas a comer? Te ayudo a que cuadre" | Llega cuando *sí* es útil (horario aprendido) |
| Tarde-noche, meta abierta | "Te faltan 40g de proteína; una cena así cierra tu día" | Accionable y específico → se agradece |
| Racha en riesgo | "Registra algo hoy y mantienes tus 12 días 🔥" (con comodín) | Protege el esfuerzo invertido |
| Logro/hito | "¡Primer mes completo!" | Celebración, refuerzo positivo |
| Ausencia (2-3 días) | "Tu coach te extraña; retomemos suave" — 1 vez, luego calla | Re-engagement sin culpar |

### Cómo NO cruzar a molesto (línea roja)
- **Nunca** por reloj fijo genérico ("¡Registra tu comida!" a las 12 en punto para todos). Siempre por **contexto + horario aprendido**.
- **Nunca** culpa ("te pasaste", "fallaste"). Un buen coach reconduce, no regaña.
- **Nunca** más allá del tope del modo, aunque el motor tenga "algo que decir".
- **Degradación automática:** si el usuario ignora N nudges seguidos, el sistema **baja solo la frecuencia** (no espera a que se moleste y desinstale).
- **La métrica que gobierna esto:** no es "notificaciones enviadas" sino **tasa de apertura útil** (nudge → acción). Si baja, enviamos menos, no más.

### Conexión con retención y anti-churn
La notificación proactiva es lo que convierte la app de **"la abro cuando me acuerdo"** (se olvida, se abandona) a **"me acompaña"** (hábito diario, difícil de dejar). Combinada con la **memoria** (roadmap §4) y las **rachas**, forma el foso: cancelar Pro = perder al que te busca cada día en el momento justo. **Ese es el "no cancelo porque perdería a mi entrenador" hecho mecánica de producto.**

---

## (5) Filtro maestro aplicado — resumen

| Pieza | ¿Entrenador en el bolsillo? | Veredicto |
|---|:--:|---|
| Chat con contexto + acciones (Fase 1) | 🟢 Te conoce y actúa | **MVP del coach** |
| Personalidad 5 tonos | 🟢 Es *tu* coach, con su voz | **Fase 1** |
| Consejo del día | 🟢 Te habla cada día | **Ya en Ola 1** |
| Proactividad + notificaciones inteligentes | 🟢 Te busca en el momento justo | **Fase 2 — corazón de Pro** |
| Horarios inteligentes | 🟢 Sabe *cuándo* hablarte | **Fase 2** |
| Modos tranquilo/normal/entrenador + anti-spam | 🟢 Sabe *cuándo callarse* | **Fase 2 — retención directa** |
| Notificación por reloj fijo genérica | 🔴 Eso es una app de dieta, no un coach | **Recortar** |
| Push motivacional vacío ("¡Hola!") | 🔴 Ruido, dispara desinstalación | **Recortar** |

---

## Handoffs
- **Karpathy:** Fase 1 necesita tu perfil compacto (§3.1) inyectado + guardrails (§3.3/§5); la proactividad necesita las señales del motor adaptativo (§4) como disparadores de nudge. Los 5 tonos son variación de tu system prompt.
- **Rams:** el selector de modo/tono, las notificaciones con "cambiar a Tranquilo" en 1 tap, y las tarjetas de consejo/logro compartibles. El modo se elige en onboarding con lenguaje humano.
- **Lugia (síntesis):** la línea Free/Pro es *reactivo-limitado vs proactivo-ilimitado*. El MVP cobrable del coach es **Fase 1**; la Fase 2 (proactividad) es el motor de anti-churn. El anti-spam no es un extra — es retención pura ("no molesta = no desinstala").

## TL;DR
**El chat es la herramienta; la proactividad es el producto.** Free = coach reactivo y limitado (degustación que engancha); **Pro = coach proactivo e ilimitado + notificaciones inteligentes = corazón del valor y del anti-churn.** Secuencia: **Fase 1 (MVP) = chat contextual + acciones + personalidad**; **Fase 2 = proactividad + notificaciones + horarios inteligentes** (primero que la conversación valga, luego que te busque). **Anti-spam = feature de primera clase:** 3 modos (tranquilo/normal/entrenador) + topes duros + degradación automática → *no molestar = no desinstalar = no cancelar*. Toda notificación pasa 2 pruebas: útil ahora + lo diría un entrenador humano.
