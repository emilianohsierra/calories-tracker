# Rediseño de Producto + Roadmap — De Calculadora a Compañero de Salud con IA

**Autor:** Head of Product (Drucker) · **Misión mayor** · Fecha: 2026-07-28
**Construye sobre:** `plan/premium-vision-producto.md` · **Integra:** Karpathy (`plan/premium-vision-nutricion-ia.md`), Rams (`plan/premium-vision-ux.md`), Jony Ive (dirección de producto/sensación)
**Reporta:** Lugia (síntesis)

> **Mis carriles aquí:** arquitectura de información + navegación, secuencia del roadmap, marco de monetización (vender tranquilidad), estrategia de retención y diferenciadores. **No invado:** las fórmulas y guardrails clínicos son de Karpathy (§ su doc); el layout de pantallas, anillos y wireframes son de Rams (§ su doc). Aquí decido **qué entra, en qué orden y por qué se paga.**

---

## Filtro maestro (se aplica a TODO lo de abajo)
> **"¿Esto hace que el usuario sienta que tiene un entrenador profesional en el bolsillo?"**
Si la respuesta es no → se recorta o se pospone. Un entrenador **te conoce, te dice qué hacer hoy, te ajusta el plan y te acompaña**. No es una hoja de cálculo con más columnas. Cada feature se marca: 🟢 refuerza el "entrenador en el bolsillo" · 🟡 soporte necesario pero no es el sentimiento · 🔴 recortar.

---

## (1) Arquitectura de información y navegación

Principio (alineado con Ive/Rams): **"un coach sereno, no un tablero de contabilidad"**. La navegación debe responder, en orden, a 3 preguntas del usuario: **¿voy bien HOY? · ¿qué hago ahora? · ¿progreso en el tiempo?**

### Navegación raíz — 4 destinos (tab bar móvil), no más
```
┌───────────┬───────────┬───────────┬───────────┐
│   HOY     │  REGISTRAR │  COACH    │  PROGRESO │
│ (Home)    │   (+FAB)   │           │           │
└───────────┴───────────┴───────────┴───────────┘
```
Cuatro y solo cuatro. Más pestañas = tablero de contabilidad. El **perfil/ajustes** vive en un icono de la esquina de HOY, no ocupa una pestaña.

| Destino | Qué vive aquí | Pregunta que responde | Free/Pro |
|---|---|---|---|
| **HOY** (Home) | Héroe: anillos de meta+macros del día · racha · 1 insight del coach · adherencia semanal · accesos rápidos (agua +1, peso) | *¿Voy bien hoy?* | Base Free; widgets avanzados con teaser Pro |
| **REGISTRAR** (FAB central) | Foto · texto ("2 tacos de pastor") · "Mis platillos" · manual | *Registrar sin fricción* | Foto limitada Free; texto/manual/memoria libres |
| **COACH** | Chat conversacional · plan de comidas · reporte semanal de insights · retos | *¿Qué hago ahora?* | **Corazón de Pro** (degustación en Free) |
| **PROGRESO** | Tendencias (semana/mes/histórico) · peso y medidas · micros · niveles/logros/rachas (detalle) | *¿Avanzo en el tiempo?* | Histórico y micros Pro; gamificación básica Free |

**Jerarquía de pantallas (mapa):**
```
Onboarding (fuera de tabs, primera vez) → Revelación del plan → HOY
HOY ──► detalle de día · editar meta · perfil/ajustes/suscripción
REGISTRAR ──► resultado IA (editable) · corregir a la IA · guardar
COACH ──► hilo de chat · plan del día/semana · detalle de reporte
PROGRESO ──► tendencia (toggle) · ficha de peso/medidas · galería de logros · detalle de reto
```
Regla transversal (de Rams): **un dato protagonista por pantalla**; todo lo demás es soporte. El onboarding y la revelación del plan viven **fuera** del tab bar (flujo lineal, sin distracción) y terminan en acción, no en muro.

---

## (2) Roadmap priorizado por fases (visión completa, ejecución de 1-2 personas)

Disciplina: **capturar toda la visión, enviar en incrementos de ~2-3 semanas**. Cada ola es lanzable y deja algo cobrable o medible. Nada de épicas de mes para un equipo de 2.

### 🌊 OLA 1 — "El núcleo coach que justifica 99 MXN" *(Stripe Pro ya validado en test)*
Objetivo: que al pagar el usuario **sienta un entrenador**, no una calculadora con login. Reusa la infra ya construida (auth, Supabase, Stripe, contador).

| # | Entrega | Filtro | Dueño técnico | Esfuerzo |
|---|---|:--:|---|:--:|
| 1 | **Onboarding por objetivos + revelación del plan** (motor de cálculo Mifflin-St Jeor/TDEE/macros de Karpathy §2; UI de Rams §1) | 🟢 | Karpathy motor + Rams UI | M |
| 2 | **HOY con anillos + meta personalizada** (adiós al `2000` hardcodeado) | 🟢 | Rams | M |
| 3 | **Reporte semanal con 1-3 insights accionables** ("te faltó proteína 4 días; prueba huevo/frijol") | 🟢 | Karpathy | B-M |
| 4 | **Registro por texto** ("2 tacos de pastor") — 0 costo de visión | 🟢 | CTO | B |
| 5 | **Rachas + racha congelada** (gamificación mínima anti-ansiedad, Rams §3) | 🟢 | Rams | B |
| 6 | **Consejo del día personalizado** (parte del loop diario; ver §7 — gancho viral/compartible) | 🟢 | Karpathy prompt + Rams UI | B |
| 7 | **Paywall + planes Free/Pro vivos** (`plan/E-monetizacion-producto.md`) | 🟡 | ya hecho, cablear | B |

> **Por qué esta ola justifica 99 MXN:** el usuario recibe **su plan calculado (entrenador que lo conoce) + un reporte que le dice qué cambiar (entrenador que lo guía) + un consejo diario que lo saluda + registro sin fricción + racha que lo sostiene**. Eso ya *se siente* como un coach. El chat completo llega en Ola 2, pero la Ola 1 ya pasa el filtro maestro.

### 🌊 OLA 2 — "Coach conversacional + adaptación"
| Entrega | Filtro | Notas |
|---|:--:|---|
| **Chat nutricionista IA** (Karpathy §3, con guardrails §3.3) — degustación 3/mes en Free | 🟢 | El "entrenador en el bolsillo" literal |
| **Motor adaptativo semanal** (Karpathy §4: ajusta kcal por tendencia, explicando el porqué) | 🟢 | "Mi coach me ajusta el plan" = anti-churn puro |
| **"Mis platillos" / memoria** de recurrentes | 🟢 | Retención + costo de cambio (ver §4) |
| **Metas de macros dinámicas** (ancla Pro estilo MacroFactor) | 🟢 | |
| **Personalidad adaptable del coach (5 tonos)** — el mismo motor, distinta voz (ver §7) | 🟢 | Barata (variación de prompt), alta afinidad/retención |
| **Retos de hábito + niveles** (Rams §3) | 🟡 | Motor de retención |

### 🌊 OLA 3 — "Planes y profundidad"
Planes de comida (Karpathy §3.4, regenerar solo lo cambiado) · dashboard completo (tendencia mensual, micros, peso/medidas) · voz · barcode (paridad) · modo precisión (modelo mayor) como upsell "IA avanzada".

### 🌊 OLA 4 — "Expansión y riesgo controlado"
**Módulo de condiciones médicas** (Karpathy §5) — **al final a propósito, por riesgo legal**: requiere T&C + consentimiento revisados por abogado y validación de un nutriólogo colegiado. B2B (nutriólogos/gimnasios) · referidos · SEO español. **Siguen descartados:** feed social, wearables, ayuno como feature ancla (ver §6).

### Centro de Especialistas IA — ampliado, pero secuenciado por riesgo/demanda
Emiliano amplía el catálogo (más deportes, más condiciones clínicas, más dietas, **etapas de vida**). **Mantengo la disciplina: el catálogo crece, pero el orden de lanzamiento lo manda el riesgo, no el entusiasmo.** Un especialista mal lanzado en zona clínica es riesgo legal real (Karpathy §5).

1. **Ola 1-2 — Bajo riesgo, alta demanda (arrancan aquí):** **Pérdida de grasa**, **Hipertrofia/ganar músculo**, **Runner/resistencia**, **Bienestar/salud general**. Fórmulas estándar, población sana, sin exposición clínica. Son el 80% de la demanda.
2. **Ola 3 — Riesgo medio:** más deportes (ciclismo, triatlón, fuerza/CrossFit, natación) y patrones dietéticos (keto, vegano, vegetariano, alta proteína, mediterránea) como *modificadores* de los anteriores. Población sana, exposición baja-media.
3. **Ola 4 — Riesgo alto (al FINAL, con blindaje):** **coaches clínicos y etapas de vida sensibles** — diabetes, hipertensión, colesterol, hígado graso, **renal**, y **embarazo/lactancia/niños/adultos mayores**. Se lanzan **solo** con T&C + consentimiento revisados por abogado, validación de nutriólogo colegiado, y en **"modo conservador"** (registro + educación general, sin prescripción, disclaimers reforzados). **Las etapas de vida sensibles (embarazo/lactancia/menores) y renal/diabetes T1 son las últimas de todas.** Nunca antes.

> **Cómo escala sin abrumar (nota de producto):** el Centro de Especialistas se presenta como el catálogo por categorías del onboarding de Rams (§1) — el usuario solo ve lo relevante a su objetivo. Ampliar el catálogo **no** complica la UI; cada especialista es una configuración de perfil + variación de prompt sobre el mismo motor, no una pantalla nueva. Barato de sumar, caro solo en los clínicos (por el blindaje legal, no por el código).

**Regla de corte para equipo de 2:** si una entrega no cabe en ~2 semanas de un dev, se parte o se pospone.

---

## (3) Monetización — vender TRANQUILIDAD, no funciones (anti-churn)

**Reencuadre central:** no vendemos "dashboard + chat + micros". Vendemos **"tengo a alguien que se ocupa de que yo vaya bien"**. La lista de features es el *cómo*; la promesa es **tranquilidad y acompañamiento**. Esto cambia el copy, el paywall y — sobre todo — **por qué NO se cancela**.

### El motor anti-churn: "no cancelo porque perdería a mi entrenador"
Lo que retiene no es una función, es una **relación con costo emocional de romperse**:
- **Mi coach me conoce** (mi objetivo, mi comida, mis intolerancias, mi progreso) → cancelar = empezar de cero con otro.
- **Mi coach me ajusta** (motor adaptativo Ola 2) → si cancelo, nadie recalibra mi plan.
- **Mi coach recuerda** (memoria, §4) → mi histórico y mis platillos se quedan aquí.
- **Mi racha y mi progreso viven aquí** → cancelar se siente como *tirar el esfuerzo*.

### Free vs Pro bajo el marco "tranquilidad"
Free entrega **la herramienta**; Pro entrega **el acompañamiento (la tranquilidad)**.

| | **FREE — la herramienta** | **PRO ($99/mes · $799/año) — el coach** |
|---|---|---|
| Registro foto | 10/mes | Ilimitado |
| Registro texto/manual/memoria | Ilimitado (memoria hasta 10) | Ilimitado |
| Objetivos | 1 | Multi-objetivo |
| Plan calculado + HOY con anillos | ✅ | ✅ |
| **Chat coach** | 3/mes (degustación) | **Ilimitado** — *"tu coach siempre disponible"* |
| **Ajuste adaptativo del plan** | ❌ | ✅ — *"alguien recalibra por ti"* |
| **Reporte semanal de insights** | ❌ | ✅ |
| Dashboard completo (tendencia mes, micros, peso/medidas) | ❌ (teaser) | ✅ |
| Historial | 7 días | Ilimitado |
| Gamificación | rachas + logros básicos (todos) | + retos exclusivos |

**Precio y trial (ya cerrado):** $99 MXN/mes · $799/año (2 meses gratis) · **trial 7 días** · cobro web/Stripe. Copy del paywall centrado en **la promesa, no la lista**: *"No cuentes calorías solo. Ten un coach que se ocupa de que llegues a tu meta."*

**Anti-churn operativo (al cancelar):** mantener Pro hasta fin de periodo (`cancel_at_period_end`), **nunca borrar datos/histórico** (el costo de cambio se preserva), y ofrecer **pausar en vez de cancelar** ("¿pausas 1 mes y conservas tu coach y tu racha?"). Detalle en `plan/E-monetizacion-producto.md`.

---

## (4) Retención — loop diario, rachas y memoria como costo de cambio

### El loop de feedback diario (el hábito que hay que instalar)
```
Comer → REGISTRAR (foto/texto, <15s) → HOY se actualiza (anillos suben) →
el Coach reacciona ("te quedan 640 kcal; una cena con proteína cierra tu día") →
usuario actúa → cierra el día → racha +1 → mañana repite
```
La clave de retención es que **cada registro produzca una reacción del coach**, no solo un número. Ese micro-diálogo diario es lo que convierte tracking (aburrido, se abandona) en acompañamiento (pegajoso). El registro por texto (Ola 1) baja la fricción del loop; el chat (Ola 2) lo cierra.

### Rachas — sostener sin ansiedad
Rachas de **registro/hábito**, no de dieta (nunca romper racha por "comer de más" — eso es dañino y ahuyenta). **Racha congelada / día comodín** (Rams §3) para no destruir semanas por un tropiezo. Celebración breve, nunca culpa.

### La MEMORIA como foso y costo de cambio
Esto es lo que hace que irse **duela**:
1. **Perfil e historial** — objetivo, intolerancias, progreso longitudinal. Cuanto más tiempo, más personalizado el consejo → **irse = perder a alguien que ya te conoce**.
2. **"Mis platillos"** — sus comidas recurrentes ya reconocidas (también baja costo de API).
3. **Memoria del coach** — el chat referencia tu historia ("como la última vez que subiste carbos y mejoraste"). Un competidor genérico arranca en cero contigo.

> Estratégicamente: **entre más viejo el usuario, más caro le sale irse.** Por eso la retención temprana (Ola 1) importa tanto — construye el activo que retiene después.

### Métricas de retención (día 1)
- **Retención D7 >25%** (¿instalamos el loop diario?)
- **% de días con registro** (frecuencia del loop) y **% de registros que generan interacción con el coach**
- **Conversión Free→Pro 3-5%** y **churn mensual de Pro <8%** (el número que valida "vender tranquilidad")

---

## (5) Diferenciadores vs los grandes

| Competidor | Su fuerza | Nuestro ángulo (lo que ellos NO son) |
|---|---|---|
| **Apple Health** | Agrega datos de todo el ecosistema Apple | Es un **almacén de datos, no un coach**: no te dice qué cenar ni ajusta tu plan. Nosotros **actuamos sobre el dato**. |
| **MyFitnessPal** | BD gigante + barcode | Genérico, gringo, UX de contabilidad; comida latina mal representada. Nosotros: **comida mexicana real + coach que guía**. |
| **Oura** | Sensación premium, bienestar sereno | Mide sueño/recuperación pero **no come contigo**; sin nutrición accionable. Tomamos su *serenidad de diseño* y la aplicamos a **nutrición que sí actúa**. |
| **Yazio** | Recetas + ayuno | Enfoque euro, español flojo, no entiende porciones latinas ni acompaña. |
| **MacroFactor** | Ajuste dinámico de macros (lo mejor en su clase) | Nicho fitness avanzado, inglés, sin foto-IA fuerte, nada cultural. Tomamos su *rigor de ajuste* y lo hacemos **conversacional y en español**. |

**Posicionamiento en una frase:**
> **"El único coach de nutrición que habla tu idioma, entiende tu comida (mexicana/latina) y se ocupa de que llegues a tu meta — sereno como Oura, listo como un entrenador, sin dietas de castigo."**

Tres cosas que **ninguno reúne**: (a) **coach que actúa** (no solo mide/registra), (b) **relevancia cultural** (comida y español latino), (c) **serenidad de bienestar** (no ansiedad de dieta). Ese cruce es el foso.

---

## (6) Filtro maestro aplicado — qué se recorta

| Feature | ¿Entrenador en el bolsillo? | Veredicto |
|---|---|---|
| Onboarding→plan calculado, chat coach, reporte semanal, ajuste adaptativo, memoria | 🟢 Sí, es el corazón | **Construir (Olas 1-2)** |
| Registro texto/voz, "Mis platillos", rachas anti-ansiedad | 🟢 Habilitan el loop diario del coach | **Construir** |
| Planes de comida, dashboard profundo, micros | 🟡 Soporte del coach, no el sentimiento | **Ola 3** |
| Coaches médicos | 🟢 (pero riesgo legal) | **Ola 4 con blindaje legal/clínico** |
| Barcode | 🟡 Paridad, no diferencia | **Ola 3** |
| **Feed social/comunidad** | 🔴 Un entrenador no es una red social; moderación cara para equipo de 2 | **Recortar** |
| **Integración wearables** | 🔴 Mucho esfuerzo, no cambia el sentimiento de coach | **Recortar (reevaluar)** |
| **Ayuno intermitente como feature ancla** | 🔴 No es nuestro ángulo; ya lo tienen Yazio/Lifesum | **Recortar** (dejar como *modificador* de dieta, no módulo) |
| **Modo precisión gpt-4o/Sonnet vendido aparte** | 🟡 Upsell menor, no ancla | **Dentro de Pro, no venta separada** |

---

## (7) Adendum — 3 apuestas de afinidad, retención y adquisición

Tres funciones **baratas y muy retentivas** que Emiliano sumó. Mi lectura: son *fuerza-multiplicador* del sentimiento "entrenador en el bolsillo" a costo casi nulo → van **temprano**, no al final.

### 7.1 Centro de Especialistas IA ampliado — ver secuencia por riesgo arriba
Resumen: catálogo grande, **lanzamiento por riesgo**. Bajo-riesgo/alta-demanda en Ola 1-2; deportes y dietas en Ola 3; **clínicos y etapas de vida sensibles (embarazo/lactancia/niños/renal/diabetes) al final, con blindaje legal/clínico**. Cada especialista = perfil + prompt sobre el mismo motor (barato); el costo real está en la validación legal de la zona clínica, no en el desarrollo.

### 7.2 Personalidad adaptable del coach — 5 tonos *(Ola 2, barata, alta afinidad)*
El mismo motor y los mismos números, **distinta voz**. El usuario elige cómo le habla su coach — esto sube la afinidad emocional (base del anti-churn "es *mi* coach") a costo casi cero (variación de system prompt, sin lógica nueva).

- **5 tonos propuestos** (Karpathy afina el copy, Rams el selector): **Motivador** (animoso, "¡vamos!") · **Sereno/mindful** (calma, sin presión — alineado con Ive/Oura) · **Directo/sin rodeos** (datos y acción, cero relleno) · **Cercano/cuate** (informal, mexicano, con humor ligero) · **Profesional/técnico** (preciso, tipo nutriólogo). 
- **Reglas de producto:** el tono cambia la **forma**, nunca el **contenido de seguridad** — los guardrails clínicos (Karpathy §3.3/§5) y los números son idénticos en los 5. En zona clínica/condición médica, el tono se **modera automáticamente** hacia profesional-conservador (nada de "cuate" dando consejo a un diabético).
- **Free vs Pro:** ofrecer **1-2 tonos en Free** (el default Sereno) y **los 5 + cambio libre en Pro** → refuerza "personalización = Pro" sin poner el hábito tras el muro.
- **Ubicación UX:** se elige en onboarding (default inteligente: Sereno) y se cambia en perfil. *Esfuerzo: bajo.* Dueño: Karpathy (voces) + Rams (selector).

### 7.3 Consejo del día — loop diario + posible gancho de adquisición *(Ola 1)*
Un consejo corto, **personalizado con los datos del usuario** (objetivo, progreso reciente, comida de ayer, entreno de hoy), que aparece cada día en **HOY**. Es el "saludo del entrenador" que abre el loop diario que ya definí en §(4).

- **Doble función:**
  1. **Retención (Ola 1):** es parte del **loop de feedback diario** — da una razón para abrir la app *antes* de comer, no solo para registrar. Ancla el hábito. Barato: 1 llamada corta/día, cacheable, y en Free puede ser semi-genérico por objetivo (0 costo marginal).
  2. **Adquisición / viral (evaluar):** el consejo (o un logro/racha) se puede **compartir** como tarjeta bonita (imagen generada, marca discreta) → gancho orgánico tipo "mi coach me dijo hoy…". **Mi recomendación: probarlo como experimento de crecimiento, no darlo por hecho.** El contenido viral compartible funciona si la tarjeta es *estéticamente deseable* (terreno de Rams/Ive) y el consejo se siente *personal e ingenioso*, no genérico. Riesgo: consejos flojos = nadie comparte. Métrica de validación: **tasa de compartidos por usuario activo** y **k-factor** del canal.
- **Free vs Pro:** consejo del día **gratis para todos** (es adquisición + hábito, no debe ir tras el muro); la *profundidad* (consejo ligado a tu ajuste semanal, o "pídele más a tu coach") tira hacia el chat Pro.
- **Guardrail:** el consejo pasa por los mismos guardrails clínicos; en perfiles de condición médica se mantiene en educación general + disclaimer. *Esfuerzo: bajo-medio.* Dueño: Karpathy (motor/prompt) + Rams (tarjeta compartible).

**Diferenciador reforzado:** personalidad + consejo diario personalizado es exactamente lo que Apple Health/MyFitnessPal **no** tienen (ellos muestran datos, no te *hablan*). Sube el "coach que actúa" del §(5) a "coach que además tiene voz propia y te busca cada día".

---

## Handoffs y dependencias
- **Karpathy:** Ola 1 depende de tu motor de cálculo §2 y del prompt del reporte semanal; Ola 2 del chat §3 + adaptativo §4. El "modo condición médica" §5 es decisión conjunta producto+legal para Ola 4.
- **Rams:** la navegación de 4 destinos de §(1) es el esqueleto donde encajan tu onboarding, dashboard y gamificación; el paywall "vender tranquilidad" §(3) necesita tu W6 con copy de promesa, no de lista.
- **Jony Ive:** la sensación "coach sereno, no contabilidad" gobierna la jerarquía de HOY y la contención de features (§6) — recortar es diseño.
- **Lugia (síntesis):** la apuesta es la **Ola 1** — convierte la calculadora en coach cobrable con esfuerzo bajo-medio sobre infra ya construida y Stripe ya validado. El anti-churn (§3-4) es la tesis de negocio: vendemos tranquilidad, y la memoria hace que irse duela.

## TL;DR
Navegación de **4 destinos** (Hoy/Registrar/Coach/Progreso). Roadmap en **4 olas**: Ola 1 = onboarding+plan calculado, HOY con anillos, reporte semanal, registro por texto, rachas, **consejo del día** y paywall — ya *se siente* como coach y justifica los 99 MXN. Coaches por riesgo: **grasa/músculo/runner/bienestar primero; deportes+dietas en Ola 3; clínicos y etapas de vida sensibles (embarazo/lactancia/niños/renal/diabetes) al final con blindaje legal**. **3 adendos (§7):** Centro de Especialistas ampliado (secuenciado por riesgo), **personalidad adaptable (5 tonos, Ola 2, barata)** y **consejo del día (Ola 1)** — parte del loop diario y **candidato a gancho viral/compartible (probar como experimento, no darlo por hecho)**. Monetización = **vender tranquilidad**; el anti-churn es "perdería a mi entrenador", y la **memoria es el costo de cambio**. Diferenciador: **coach que actúa + tiene voz propia + te busca cada día + cultura latina + serenidad tipo Oura**. Recortar feed social, wearables y ayuno-como-ancla para proteger el foco de un equipo de 2.
