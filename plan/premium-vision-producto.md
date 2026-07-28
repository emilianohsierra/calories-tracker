# Visión de Producto Premium — De Calculadora a Coach de Nutrición con IA

**Autor:** PM Líder (Drucker Product) · **Misión estratégica** · Fecha: 2026-07-28
**Coordina:** Lugia (Director, síntesis final) · **Integra con:** Karpathy AI-Nutri (ciencia + IA), Rams Design (UX/onboarding/dashboard)
**No invado:** el *cómo* científico (grounding, coherencia energética, pipeline de visión → BD) es de Karpathy; el *cómo* visual (anillos, skeletons, onboarding UI, tokens) es de Rams. Aquí defino **qué construir, para quién, en qué orden y por qué se paga.**

---

## Tesis
El mercado no necesita otra calculadora de calorías: MyFitnessPal ya la ganó. Lo que **no existe bien en español/LatAm** es un **coach nutricional que entienda la comida que sí comemos** (tacos, guisados, antojitos) y que **acompañe hábitos**, no que castigue. Nuestro producto pasa de *"cuánto comí"* (dato) a *"qué hago con eso"* (guía). El dato es commodity; **el consejo accionable en español sobre comida latina es el foso.**

---

## (1) Filtro de funcionalidades — ¿por qué pagarían por esto?

Cada feature pasa 5 filtros: **P**aga (¿justifica $99?) · **R**esuelve un problema real · **Ret**iene · **V**alor percibido · **Dif**erencia. Veredicto: ✅ construir / 🟡 después / ❌ descartar.

| Feature propuesta | P | R | Ret | V | Dif | Veredicto |
|---|:-:|:-:|:-:|:-:|:-:|---|
| **Análisis de foto con IA** (core actual) | — | ✅ | ✅ | ✅ | 🟡 | ✅ **Gancho gratis** (no es el foso; todos lo tienen) |
| **Grounding vs BD mexicana/SMAE** (Karpathy) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ **El foso.** Números creíbles en comida latina = razón #1 para confiar y pagar |
| **Coach conversacional** ("¿qué ceno para llegar a mi meta de proteína?") | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ **El foso #2.** Es lo que convierte dato en valor; nadie lo hace bien en español |
| **Registro por texto/voz** ("2 tacos de pastor y un agua") | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ Baja fricción + **0 costo de visión**. Diferencial en comida hablada en español |
| **"Mis platillos" / memoria de recurrentes** | 🟡 | ✅ | ✅ | ✅ | — | ✅ Retención pura + baja costo API. Barato de construir |
| **Metas de macros + ajuste dinámico** (estilo MacroFactor) | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ **Pro.** El ajuste automático de meta según progreso es premium defendible |
| **Rachas / niveles / retos de hábito** | 🟡 | ✅ | ✅ | ✅ | 🟡 | ✅ Motor de retención (ver §5). Gratis, no Pro (retención ≠ paywall) |
| **Reporte semanal con insights** ("comes 30% menos proteína los findes") | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ **Pro.** Valor recurrente que justifica la cuota mes a mes |
| **Escaneo de código de barras** | 🟡 | ✅ | 🟡 | 🟡 | ❌ | 🟡 Paridad, no diferencial. Después de ola 2; costoso mantener BD de barcodes |
| **Planes de comida / recetas generadas** | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | 🟡 Alto esfuerzo, mantenimiento constante. Ola tardía; validar demanda antes |
| **Integración wearables (Apple Health/pulseras)** | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ❌ **Descartar por ahora.** Mucho esfuerzo de integración, poco diferencial, no lo pide el nicho |
| **Comunidad / feed social** | ❌ | ❌ | 🟡 | 🟡 | ❌ | ❌ **Descartar.** Moderación cara, distrae del core, equipo de 2 no lo sostiene |
| **Ayuno intermitente (timer)** | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | ❌ **Descartar v1.** Lifesum/Yazio ya lo tienen; no es nuestro ángulo. Reevaluar |
| **Modo "precisión" gpt-4o** | 🟡 | 🟡 | — | 🟡 | ❌ | 🟡 Upsell menor, no feature ancla. Ofrecer dentro de Pro, no venderlo aparte |

**Descartes explícitos (no ganan su lugar hoy):** wearables, feed social, ayuno intermitente. Razón común: **esfuerzo alto / diferenciación baja / no lo pide nuestro nicho**, y un equipo de 2 personas debe proteger su foco. Barcode y planes de comida quedan en espera, no muertos.

---

## (2) Corte Free vs Pro y el foso

**Principio:** Free debe ser **genuinamente útil** (para que la gente se quede y nos recomiende), pero el **acompañamiento inteligente y el histórico** son Pro. Regla heredada del paywall: **el registro manual/texto siempre es gratis e ilimitado**; se limita el *análisis con IA* (lo que cuesta) y se reserva el *coaching* (lo que diferencia).

| | **Free** | **Pro — $99 MXN/mes / $799 año** |
|---|---|---|
| Análisis de foto IA | 10 / mes | Ilimitado (uso justo) |
| Registro texto/voz + manual | Ilimitado | Ilimitado |
| Resumen diario + meta calórica | ✅ | ✅ |
| Grounding BD mexicana (números creíbles) | ✅ (es confianza base, no se cobra) | ✅ |
| Historial | 7 días | **Ilimitado** |
| **Coach conversacional** | 3 preguntas/mes (degustación) | **Ilimitado** |
| **Metas de macros + ajuste dinámico** | Solo calorías | ✅ |
| **Reporte semanal con insights** | ❌ | ✅ |
| Rachas, niveles, retos | ✅ (retención para todos) | ✅ + retos exclusivos |
| "Mis platillos" (memoria) | Hasta 10 | Ilimitado |
| Exportar CSV / sin anuncios | ❌ | ✅ |

**El foso (por qué no nos copian fácil):**
1. **BD nutricional mexicana/latina curada (SMAE)** — activo propio, caro de replicar, mejora con cada uso (Karpathy).
2. **Coach en español entrenado sobre esa comida** — no es un wrapper de ChatGPT genérico; conoce porciones y platillos locales.
3. **Datos longitudinales del usuario** — cuanto más tiempo lleva, más personalizado el consejo → **costo de cambio alto** (el histórico y el coach calibrado no se lo lleva a otra app).

Free entrega **confianza** (números creíbles). Pro entrega **acompañamiento** (qué hacer con esos números). Esa línea es la que justifica $99/mes.

---

## (3) Roadmap priorizado por olas (valor vs esfuerzo, equipo de 2)

Filosofía: **enviar valor cada 2-3 semanas**, no construir 6 meses a ciegas. Cada ola es lanzable y deja algo cobrable o medible.

### 🌊 OLA 1 — "Coach mínimo que justifica $99" *(máximo valor / mínima complejidad)*
Objetivo: que el usuario sienta que paga por **guía**, no por una calculadora. Reusa infra que ya está en el roadmap maestro (auth, Stripe, contador).
1. **Grounding básico + coherencia energética** (Karpathy) → números que se sienten reales. *Esfuerzo medio, valor máximo — es la base de todo lo demás.*
2. **Reporte semanal con 1-3 insights accionables** ("te faltó proteína 4 días; prueba huevo o frijol en el desayuno"). *Esfuerzo bajo-medio: es un prompt sobre datos que ya guardamos. Alto valor percibido, recurrente.*
3. **Registro por texto** ("2 tacos de pastor") → baja fricción, 0 costo de visión. *Esfuerzo bajo.*
4. **Rachas + meta diaria cumplida** (gamificación mínima, §5). *Esfuerzo bajo, gran efecto en retención D7.*
5. **Paywall + planes Free/Pro vivos** (ya diseñado en `plan/E-monetizacion-producto.md`). *Habilita el cobro.*

> Por qué esta ola justifica $99: el usuario obtiene **números creíbles + un reporte que le dice qué cambiar + registro sin fricción**. Eso ya es un coach básico, no una calculadora.

### 🌊 OLA 2 — "Coach conversacional + hábitos" *(sube retención y valor percibido)*
1. **Coach conversacional** (Karpathy define el motor; yo defino los casos: "¿qué ceno para cerrar mi meta?", "¿es sano esto?"). Degustación gratis (3/mes) → conversión.
2. **Metas de macros + ajuste dinámico** (ancla Pro estilo MacroFactor).
3. **"Mis platillos" / memoria** de recurrentes.
4. **Retos de hábito ligados a salud** (§5): "5 días con verdura", no "come menos".
5. **Onboarding de objetivo enriquecido** (Rams lo diseña; yo aporto la lógica de meta → plan).

### 🌊 OLA 3 — "Profundidad y paridad" *(cuando ya hay usuarios pagando)*
1. Historial/analítica avanzada + tendencias.
2. Voz (dictar la comida).
3. Escaneo de código de barras (paridad).
4. Modo precisión gpt-4o dentro de Pro.
5. Niveles/logros avanzados + retos sociales ligeros (sin feed).

### 🌊 OLA 4 — "Expansión" *(validar demanda antes de invertir)*
Planes de comida/recetas · B2B (nutriólogos/gimnasios) · referidos + SEO en español. **Wearables, feed social y ayuno siguen descartados** salvo señal fuerte de usuarios.

**Regla de corte para equipo de 2:** si una feature no cabe en ~2 semanas de un dev, se parte o se pospone. Nada de épicas de mes.

---

## (4) Posicionamiento competitivo — nuestro ángulo único

| App | Su fuerza | Su hueco (nuestra entrada) |
|---|---|---|
| **MyFitnessPal** | BD gigante, barcode | Genérica/gringa, UX pesada, comida latina mal representada, cara |
| **Lifesum** | UX bonita, planes | Europea, en español flojo, comida latina ausente |
| **Yazio** | Ayuno + recetas | Enfoque euro, no entiende porciones latinas |
| **MacroFactor** | Ajuste dinámico de macros (lo mejor en su clase) | Nicho fitness avanzado, inglés, sin foto-IA fuerte, nada latino |

**Nuestro posicionamiento en una frase:**
> **"El coach de nutrición en español que entiende la comida mexicana — cuenta calorías con una foto y te dice qué hacer, sin dietas de castigo."**

Tres pilares que ninguno cubre a la vez: **(a) comida mexicana/latina real** (BD + coach), **(b) español nativo y culturalmente cercano**, **(c) enfoque en hábito, no en restricción**. No competimos en tamaño de BD ni en fitness hardcore; competimos en **relevancia cultural + acompañamiento**.

---

## (5) Retención y gamificación (desde producto — el "cómo" visual es de Rams)

**Principio rector:** gamificar **hábitos sanos y consistencia**, NUNCA restricción calórica. Nada que premie comer menos o castigue "pasarse" — eso es peligroso (riesgo de conducta alimentaria) y ahuyenta. Premiamos **registrar, balancear y sostener**.

Mecánicas, ordenadas por ROI de retención:
1. **Racha de registro** (no de dieta): "12 días seguidos registrando". Premia el hábito de trackear, que es lo que correlaciona con retención. Con protección de racha (1 día de gracia) para no frustrar.
2. **Metas de hábito positivo**, no de déficit: "3 comidas con proteína hoy", "verdura en 5 de 7 días", "desayuno registrado 5 días". Ligadas a salud, medibles con datos que ya tenemos.
3. **Niveles por consistencia** ("Aprendiz → Constante → Maestro de hábitos"), suben por semanas activas, no por peso perdido.
4. **Retos mensuales temáticos** ("Semana de la proteína", "Reto hidratación") — renuevan la app y dan tema al reporte semanal.
5. **Celebración de progreso, no de números** en la báscula: hitos como "primer mes completo", "50 comidas registradas".

**Anti-patrones que prohibimos explícitamente:** rachas que se rompen por comer de más, badges por "menor calorías", rankings públicos de peso, presión de déficit. Nuestra marca es **salud sostenible, no culpa**. Esto también nos diferencia y protege reputacionalmente.

**Conexión con monetización:** la gamificación es **gratis para todos** (motor de retención y boca-a-boca), pero los **retos exclusivos y el reporte semanal de insights** son Pro → la retención alimenta la conversión sin poner el hábito detrás del paywall.

---

## Handoffs
- **Karpathy:** ola 1 depende de tu grounding + coherencia energética; el reporte semanal y el coach necesitan tu motor. Yo aporto los casos de uso y el corte Free/Pro del coaching (3/mes gratis).
- **Rams:** el paywall (`plan/E-monetizacion-producto.md`), las mecánicas de gamificación de §5 y el onboarding de objetivo necesitan tu diseño visual (anillos, celebración de hitos, badge de racha). Yo defino qué se premia y por qué; tú, cómo se ve y se siente.
- **Lugia:** para tu síntesis — la **ola 1** es la apuesta: convierte la calculadora en coach mínimo cobrable con el menor esfuerzo, apoyándose en la infra del Sprint 1 ya planeada.

## TL;DR / Recomendación
Evolucionar a coach es **correcto y defendible**, pero el foso no es "más features": es **BD mexicana + coach en español + histórico del usuario**. Construir por olas cortas: **Ola 1 = grounding + reporte semanal + registro por texto + rachas + paywall** ya justifica $99/mes con esfuerzo bajo-medio. Descartar wearables, feed social y ayuno para proteger el foco de un equipo de 2. Gamificar hábito, nunca restricción.
