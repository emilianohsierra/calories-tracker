# Visión de Experiencia — El alma del producto

**Rol:** UX/UI Lead (cubro la capa de experiencia) · **Autor:** Rams Design (skm3lj3d)
**Fecha:** 2026-07-28 · **Tipo:** Capa de alma sobre el sistema ya diseñado
**Se apoya en (no repite):** `plan/rediseno-sistema-diseno.md` (mío), `plan/rediseno-coach-ia.md` (Karpathy), `plan/rediseno-producto-roadmap.md` (Drucker)

> Esto no es un catálogo de pantallas ni de componentes — eso ya está. Es **cómo debe SENTIRSE** usar la app. Si un día hay que elegir entre una feature y este sentimiento, gana el sentimiento.

---

## 1. Filosofía y emoción objetivo

**La app es una persona serena que se ocupa de ti, no una báscula que te vigila.**

La emoción que perseguimos, en una frase: **"tengo a alguien —tranquilo y capaz— que se ocupa de que yo vaya bien."** Tres sensaciones que deben aparecer en los primeros 10 segundos de cada sesión:

1. **Tranquilidad.** Abres la app y el pulso baja, no sube. Nada de rojo de alarma, nada de culpa por lo que comiste, nada de números gritando. Espacio, respiración, una sola cosa importante a la vez. *(Oura, Headspace.)*
2. **Confianza.** Los números se sienten reales (comida mexicana entendida de verdad) y el coach habla con tus datos, no con frases de galleta de la fortuna. Confías porque te conoce. *(MacroFactor, Stripe.)*
3. **Un entrenador en el bolsillo.** No estás solo con una hoja de cálculo: alguien te saluda en la mañana, reacciona a lo que registras y cierra tu día contigo. *(El filtro maestro de Drucker.)*

**Anti-emociones prohibidas** (si aparecen, fallamos): ansiedad, culpa, saturación, sensación de deber/castigo, de estar siendo juzgado. La marca es **salud sostenible, no dieta de sufrimiento.**

Regla rectora de todo el producto: **la calma es una feature.** Preferimos mostrar menos y que se sienta claro, que mostrar todo y abrumar. El vacío en pantalla no es espacio desperdiciado: es respiración.

---

## 2. Los 3 momentos firma

Tres instantes definen el vínculo con el usuario. Si estos tres se sienten mágicos, el resto sostiene. Son el ritmo diario del acompañamiento: **te saluda → conversa contigo → te arropa al cerrar.**

### 🌅 Momento 1 — El saludo matutino (HOME conversacional)
La app **te recibe como una persona, no como un tablero.** Al abrir por la mañana, antes que cualquier cifra, hay una frase del coach escrita para ti hoy:
> *"Buenos días, Emiliano. Dormiste poco y hoy toca tirada larga — desayuna con carbos y arrancamos suave. Tu meta: 420 g de carbos."*

- **Se siente:** que alguien pensó en ti antes de que abrieras. Cálido, presente, sin exigir nada todavía.
- **Cómo:** el saludo (con el **consejo del día**, momento WOW §4.1) va **arriba** del anillo de progreso. El dato es el marco, la voz humana es el protagonista. El anillo aparece con una animación de respiración, no de golpe.
- **Regla:** nunca un cero mudo ni un "0/2000 kcal" frío como primer contacto del día. Siempre una voz primero.

### 💬 Momento 2 — La conversación con el Coach IA (se siente ChatGPT, no chatbot)
La diferencia entre "app con chatbot" y "coach de verdad" está aquí. **Cero botones de menú, cero árboles de opciones, cero "elige 1, 2 o 3".** Lenguaje natural, respuesta que fluye token a token, y —lo crítico— **te conoce**: sabe tu meta, lo que llevas hoy, tus intolerancias, que odias el brócoli, que llevas 10 días cumpliendo proteína.
> Tú: *"¿qué ceno?"* → Coach: *"Te quedan 480 kcal y 30 g de proteína. Salmón con verduras o unos huevos al gusto cierran tu día. ¿Te lo registro?"*

- **Se siente:** hablar con alguien que llevara meses acompañándote, no con un formulario disfrazado. Inteligente, rápido, tuyo.
- **Cómo:** streaming sereno (puntos que respiran, no spinner), respuestas cortas y accionables, y **acción en 1 tap** dentro de la burbuja (Registrar / Replanear). Entra como hoja modal desde el orbe permanente: nunca pierdes dónde estabas.
- **Regla:** ninguna respuesta genérica. Si no tiene tus datos, los pide con calidez; no inventa. La memoria hace que "hace 3 semanas ni te acercabas" sea real, no decorado.

### 🌙 Momento 3 — El cierre del día
Al final del día, el coach **te arropa**: resume sin juzgar, celebra lo que salió bien, y deja el mañana listo.
> *"Día de 88/100: proteína y calorías en meta, te faltó agua. Mañana cierra 2.5 L y repite la proteína. Racha: 11 días 🔥."*

- **Se siente:** paz y cierre. Alguien contó tu día contigo y te desea buenas noches con un plan, no con una regañina.
- **Cómo:** puntuación amable (celebra, no castiga), **una** cosa a mejorar mañana (nunca una lista culpígena), y refuerzo de la racha. Si el día salió mal: reencuadre sin culpa — *"un día flojo no borra tres semanas buenas; mañana seguimos."*
- **Regla:** el cierre jamás termina en números rojos ni en "te pasaste". Termina en tranquilidad y en un mañana posible.

---

## 3. Dirección estética como principios de sensación

La paleta y tipografía ya están decididas (verde-teal `#0E7C6B`, Inter con números tabulares, motion sutil, dark de primera clase — ver sistema). Aquí van como **principios de sensación**, no como specs:

- **Sereno, no clínico.** El verde-teal transmite salud y calma, no la urgencia del rojo ni el azul corporativo genérico. El color respira; no compite por atención.
- **El movimiento tiene propósito y respira.** Nada parpadea ni rebota por decorar. Los anillos se llenan con suavidad, el coach "respira" en reposo, las celebraciones son breves y luego se van. El ritmo del producto es un pulso en calma. *(Todo respeta `reduced-motion`.)*
- **Los números son honestos y estables.** Tabulares, sin bailar al actualizarse. La cifra no grita: informa. El color de cada macro/nutriente es siempre el mismo, en todas partes, para leer sin esfuerzo.
- **El vacío es intencional.** Márgenes generosos, una jerarquía obvia, un protagonista por pantalla. La contención ES el lujo. *(Linear, Notion, Stripe.)*
- **Premium se siente en los detalles, no en la ornamentación.** Sombras de 1px, transiciones de 200ms, foco visible, targets amables al pulgar. La calidad se nota en que nada estorba.
- **Cálido antes que corporativo.** El copy habla como un entrenador mexicano cercano, no como un manual. La tipografía es impecable pero la voz es humana.

---

## 4. Momentos WOW — lo que nos vuelve referente

Cinco apuestas que elevan la app de "buena" a "de la que hablas con tus amigos". Cada una es barata de sumar y difícil de copiar porque nace de la **memoria + cultura + serenidad** que ya son nuestro foso.

### ⭐ 4.1 El Consejo del Día como tarjeta hero compartible *(gancho viral)*
Cada día, el coach te da **un consejo escrito solo para ti hoy** —anclado en tu progreso, tu comida de ayer, tu entreno de hoy— presentado como una **tarjeta hero hermosa** en el HOME.
> *"Te encanta el pozole — pídelo con más pollo y verdura y cabe justo en tu meta de hoy."*

- **El WOW:** no es una frase motivacional de banco de imágenes. Es *tan* tuyo y *tan* ingenioso que dan ganas de enseñarlo. "Mira lo que me dijo mi coach hoy."
- **Viralidad:** la tarjeta es **compartible** a stories/WhatsApp — estéticamente deseable (nuestro verde-teal, tipografía cuidada, cero PII), con marca discreta. Es adquisición orgánica: cada consejo bueno es un anuncio. *(Métrica a validar: compartidos por usuario activo / k-factor. Si el consejo es flojo, nadie comparte — la calidad del copy es la apuesta.)*
- **Por qué nadie lo copia:** requiere conocer al usuario de verdad (memoria) y su comida (BD latina). Un consejo genérico no se comparte.

### ⭐ 4.2 Elige la personalidad de tu coach — 5 tonos *(hacerlo SUYO)*
El usuario elige **cómo le habla** su coach. El mismo motor, los mismos números, **distinta alma**:
**Motivador** (¡vamos, tú puedes!) · **Sereno/mindful** (calma, sin presión — el default) · **Directo/sin rodeos** (datos y acción) · **Cercano/cuate** (informal, mexicano, con humor) · **Profesional/técnico** (preciso, tipo nutriólogo).

- **El WOW:** el coach deja de ser "el coach" y pasa a ser **mi** coach. Elegir su voz crea afinidad emocional inmediata — la misma razón por la que la gente le pone nombre a su asistente. Es el corazón del anti-churn de Drucker: "no cancelo porque perdería a *mi* entrenador."
- **Momento de diseño:** en el onboarding, un **selector con preview en vivo** — la misma frase ("te faltan 25 g de proteína") escrita en los 5 tonos, para que *sientas* la diferencia antes de elegir. Cambiar de tono después nunca borra tu memoria: es tu coach, con otra voz.
- **Regla dura:** el tono modula las palabras, **jamás** la ciencia ni los guardrails. En zona clínica se modera solo hacia profesional-conservador (nada de "cuate" aconsejando a un diabético).

### ⭐ 4.3 El registro que reacciona (no solo cuenta)
Registras "2 tacos de pastor" (foto, texto o voz) y en <15s no solo sube un número: **el coach reacciona.**
> *"Buenos tacos. Con eso llevas 1 360 kcal; una cena con proteína y cierras perfecto."*

- **El WOW:** convierte la tarea más aburrida de toda app de dieta (loggear) en un micro-diálogo. El anillo sube con suavidad, hay un toque háptico, y **alguien te contesta.** Tracking → conversación. Ese micro-diálogo diario es lo que hace que la app se sienta viva y no se abandone en la semana 2.

### ⭐ 4.4 "Meses acompañándote" desde el día 30
El coach **referencia tu pasado** de forma que ninguna app genérica puede:
> *"Hace 3 semanas ni te acercabas a 120 g de proteína; llevas 10 días seguidos cumpliéndola."*

- **El WOW:** la sensación de continuidad, de que alguien lleva un registro emocional de tu esfuerzo. Es profundamente retentivo porque **irse duele** — perderías a alguien que ya te conoce. La memoria no es una feature técnica; es el ingrediente que hace que el vínculo se sienta real.

### ⭐ 4.5 La revelación del plan (el primer "ajá")
Al terminar el onboarding, tras una espera de 2-3s con anillos llenándose ("ajustando tus macros a tu objetivo de recomposición…"), aparece **tu plan calculado solo para ti**: tu meta, tus macros, tu hidratación.

- **El WOW:** en 90 segundos pasaste de "otra app de dieta" a "esta me entendió." Es el momento que justifica seguir — y ocurre **antes** de cualquier muro de pago. La primera impresión es de competencia y cuidado, no de venta.

---

## 5. Cómo se compone todo (una línea)
Un producto que **te saluda con un consejo tuyo, te deja elegir la voz que te acompaña, reacciona cuando registras, recuerda tu esfuerzo y te arropa al dormir** — sereno como Oura, listo como un entrenador, con la calidez de hablar tu idioma y entender tu comida. Ese cruce —**coach que actúa + voz propia + memoria + cultura latina + serenidad**— es el alma, y es el foso.

---

## 6. Nota de coherencia para el equipo
- **Navegación:** existe una diferencia menor a resolver con Drucker — su roadmap propone tab bar de 4 destinos (Hoy/Registrar/Coach/Progreso); mi sistema propone Coach como **orbe permanente central**. Ambas ponen el Coach en el lugar más alcanzable; es un detalle de forma, no de alma. Lo cierro con él en una iteración; no bloquea esta visión.
- **Todo lo aquí descrito ya tiene componentes** en `plan/rediseno-sistema-diseno.md` (CoachMessageCard, ChatBubble, RingReveal, StreakBadge, selector de tono, tarjeta compartible). Esta capa dice *por qué existen y qué deben hacer sentir*.
