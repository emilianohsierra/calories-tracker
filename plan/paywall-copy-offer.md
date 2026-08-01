# Paywall — Copy & Offer (canónico)

**Autor:** Drucker (Head of Product) · Fecha: 2026-08-01 · **Reporta:** Lugia (mwao6a57)
**Para:** Jigglypuff Casey (byfh38p8) — fuente de verdad del copy para `components/UpgradeModal.js` (§5 del spec `plan/upgrademodal-premium-spec.md`).
**Marco:** vender **tranquilidad**, no funciones · **cero dark patterns** (regla del proyecto) · **beneficios honestos**.

---

## ⚠️ Regla de honestidad (leer primero — condiciona qué bullets se muestran)
El paywall **solo puede listar como incluido lo que esté DESPLEGADO en el momento de shippear.** Cada bullet abajo está marcado:
- **[LIVE]** = ya funciona hoy o al cierre de R1 (deploy memoria + coach Pro-gated).
- **[PRONTO]** = va en el bloque "Próximamente", **atenuado, badge "Pronto", sin fecha, sin lenguaje médico**.

**Casey/Rams:** si al construir el coach aún no está desplegado, mover sus bullets [LIVE→condicional] a "Próximamente". Nunca mostrar como activo algo que el usuario no puede usar al pagar. Esto NO es negociable (es la regla anti-dark-pattern del proyecto).

---

## 1. Headline (vender tranquilidad)

**Contexto de uso:** la variante `plans` se muestra a un usuario **ya enganchado** (tocó el badge o un feature Pro). Ahí el anti-churn "no pierdas a tu entrenador" funciona. La variante `limit` se muestra al agotar los 10 análisis → tono empático distinto (§4).

**Headline `plans` (recomendado):** **"No pierdas a tu entrenador"**
**Subtítulo:** "Pro es tener un coach que te conoce, recuerda tus comidas y te acompaña a tu meta — todos los días."

> Alternativas A/B (si Rams quiere probar): "Tu coach, siempre contigo" · "Deja de contar; deja que tu coach se ocupe".
>
> **Nota de honestidad sobre el headline:** "no pierdas a tu entrenador" solo es honesto **cuando el coach ya está vivo como Pro** (cierre de R1). Si el paywall se lanza **antes** de que el coach esté desplegado, usar el headline de transición: **"Tu registro, sin límites"** / sub "Analiza todas tus comidas con IA y ajusta cada estimación hasta que quede justa." — y activar el headline del coach cuando el coach shippee.

---

## 2. Qué incluye Pro — 6 bullets (acompañamiento primero)

Orden por valor emocional (tranquilidad), no por lo técnico:

1. **[LIVE]** **Tu coach de nutrición, sin límite.** Pregúntale qué cenar, cómo vas o qué ajustar — conoce tus datos y responde en tu idioma. *(En Free: 3 mensajes de prueba al mes.)*
2. **[LIVE]** **Coaches especializados para tu objetivo.** Pérdida de grasa, músculo, running, bienestar o recomposición — con tu plan calculado a la medida.
3. **[LIVE]** **Una memoria que no te olvida.** Recuerda tus platillos, tus preferencias y tu progreso; entre más te acompaña, mejor te conoce.
4. **[LIVE]** **Análisis con IA ilimitados + corrección.** Registra por foto sin contar, y ajusta cada estimación ("son 2 tacos de pastor") hasta que quede justa.
5. **[PRONTO]** **Dashboard premium.** Tus tendencias, adherencia y evolución completas, más allá de los 7 días.
6. **[PRONTO]** **Planes de comida dinámicos.** Menús que cuadran tus macros del día y se recalculan cuando cambias una comida.

> Los bullets 5-6 van en el bloque **"Próximamente en Pro"** hasta que estén desplegados. Sin fecha. Sin promesas médicas.

---

## 3. Split Free vs Pro EXACTO (por feature)

| Feature | FREE | PRO ($99 MXN/mes) | Estado |
|---|---|---|:--:|
| **Análisis de foto con IA** | 10 / mes | **Ilimitado** | LIVE |
| **Reanálisis con corrección** | — | **Sí** | LIVE |
| **Registro manual** | Ilimitado | Ilimitado | LIVE |
| **Registro por texto** ("2 tacos de pastor") | Ilimitado | Ilimitado | LIVE¹ |
| **Resumen diario, metas y macros** | Sí | Sí | LIVE |
| **Coach de nutrición (chat)** | 3 mensajes/mes (prueba) | **Ilimitado** | LIVE (R1) |
| **Coaches especializados** | 1 objetivo | **Los 5 + cambiar cuando quiera** | LIVE (R1) |
| **Memoria (te recuerda, "mis platillos")** | hasta 10 platillos | **Ilimitada** | LIVE (R1) |
| **Consejo del día** | semi-genérico | personalizado con tus datos | R2 |
| **Reporte semanal + ajuste explicado** | — | Sí | R2 |
| **Dashboard histórico completo** | 7 días | Ilimitado + tendencias | PRONTO |
| **Planes de comida dinámicos** | — | Sí | PRONTO |
| **Notificaciones inteligentes del coach** | recordatorio simple | Sí (con modos) | PRONTO (R3) |
| **Gamificación** | rachas + logros básicos | + retos exclusivos | R2 |

¹ Confirmar con CTO si el registro por texto ya está desplegado; si no, marcar Pro/PRONTO según corresponda.

**Regla del split:** el **registro manual y por texto son siempre gratis e ilimitados** — el muro bloquea una *comodidad* (análisis IA, acompañamiento del coach), nunca la función core de anotar tu comida. Esto es lo que hace el freemium honesto y no punitivo.

---

## 4. CTA y copy por variante

### Variante `plans`
- **CTA primario:** **"Hazte Pro — $99 MXN/mes"**
- **Secundario:** "Ahora no" *(cierre neutro, sin culpa — nunca "prefiero seguir limitado")*
- **isPro:** CTA "Administrar suscripción"; si `cancel_at_period_end`: "Seguirás siendo Pro hasta el fin del periodo; luego pasas a Free. **Tus datos se conservan.**"

### Variante `limit` (agotó los 10 — empático, no punitivo)
- **Titular:** "Ya usaste tus 10 análisis con IA de este mes" *(sin 🎉; "ya usaste" reconoce, no castiga)*
- **Cuerpo:** "Puedes seguir registrando a mano gratis e ilimitado, o pásate a Pro para analizar con IA sin contar."
- **CTA primario:** "Hazte Pro — $99 MXN/mes"
- **Secundario:** "Seguir con registro manual" (`onManual`)
- **Terciario:** "Tus análisis se reinician el {resetLabel}"

---

## 5. Precio y microcopy anti-fricción

- **Precio:** **$99 MXN/mes** (cifra con `.num`).
- **Microcopy bajo el CTA:** **"Cancela cuando quieras. Conservas tus datos siempre."**
- **Anual ($799):** **NO en este release.** No mostrar hasta que el `price_id` anual esté cobrable en Stripe (confirmar con Reqa/QA-Stripe). Cuando entre: toggle honesto, default mensual, el usuario elige el anual, desglose real "$799/año — equivale a $66/mes". Nunca pre-marcar el anual.

---

## 6. Checklist anti-dark-patterns (heredado del spec §8)
- [ ] "Ahora no"/cerrar siempre visible en ambas variantes.
- [ ] Ruta gratis (registro a mano) siempre ofrecida en `limit`.
- [ ] Fecha de reinicio del Free visible en `limit`.
- [ ] "Cancela cuando quieras. Conservas tus datos siempre." en `plans`.
- [ ] Cero urgencia falsa / cuenta regresiva / casillas pre-marcadas / anual pre-seleccionado.
- [ ] **Beneficios activos = solo lo desplegado HOY; el resto en "Próximamente" sin fecha.**
- [ ] Sin promesas médicas ni lenguaje terapéutico.

---

## Resumen para Casey
Headline **"No pierdas a tu entrenador"** (o el de transición "Tu registro, sin límites" si el coach aún no está vivo al shippear). **6 bullets** con acompañamiento primero, marcados [LIVE]/[PRONTO]. **Split exacto** por feature en §3. **CTA** "Hazte Pro — $99 MXN/mes" + "Ahora no". **Microcopy** "Cancela cuando quieras. Conservas tus datos siempre." **Mensual solo**, anual como fast-follow honesto. La regla de oro: **solo mostrar como activo lo que el usuario puede usar al pagar.**
