# QA de monetización Stripe (Paso E) — pre-producción

**De:** Nielsen QA (`beskkoig`) · rol: QA + Usuario Extremo
**Para:** Director Lugia (`mwao6a57`) → Emiliano / Torvalds
**Alcance:** `plan/E-monetizacion-stripe.md` + código real:
`app/api/checkout/route.js`, `app/api/portal/route.js`, `app/api/stripe/webhook/route.js`,
`lib/stripe.js`, `lib/supabase/admin.js`, `supabase/monetizacion.sql`,
`components/UpgradeModal.js`, `components/AddMealModal.js`, `app/page.js`,
`app/api/usage/route.js`. Stripe SDK v22.3.2, `apiVersion: '2025-01-27.acacia'`.
**Método:** recorrer los caminos del paywall/suscripción e intentar romperlos.

---

## ✅ Lo que está BIEN (verificado, no tocar)

- **[Área 5] El candado atómico de Free NO se rompió.** `supabase/monetizacion.sql` cambia en
  `consumir_analisis` **solo** la rama de plan (`premium → v_pro_limit`). El camino Free es
  idéntico: `v_limit=free_limit(10)`, mismo `insert … on conflict … where count < v_limit`
  atómico, mismo airbag, misma idempotencia. **Free sigue tope 10, lock intacto. CONFIRMADO.**
- **[Área 2] Pro usa `pro_limit=1000` finito** (no ilimitado) vía `app_config`; el airbag global
  sigue como 2º tope. CONFIRMADO.
- **Webhook — seguridad:** verificación de firma (`constructEvent`) ANTES de tocar la DB;
  `service_role` solo en `lib/supabase/admin.js`, importado solo por el webhook; RLS de
  `subscriptions` = SELECT propio; `stripe_events` sin acceso cliente. CONFIRMADO.
- **[Área 1] Gate pre-IA:** Free con 0 saldo abre el modal y **NO** llama a `/api/analyze`
  (`AddMealModal.onAnalyzeClick`); el 429 del server queda de respaldo. CONFIRMADO.
- **UpgradeModal 3 salidas** (Hazte Pro / Registrar a mano / Cerrar) cableadas; el usuario ya-Pro
  ve "Administrar suscripción" (portal), no re-suscribir. CONFIRMADO.
- **Idempotencia con errores atrapados:** si el proceso lanza y se atrapa, se borra el marcador
  → el reintento de Stripe reprocesa. Correcto **para errores atrapados** (ver B1 para el hueco).

---

## 🔴 BLOQUEANTE

### B1 — Webhook: el marcador de idempotencia se inserta ANTES de procesar → pago sin Pro, sin auto-recuperación. [Área 3]
`app/api/stripe/webhook/route.js:36` inserta en `stripe_events` **antes** de procesar; solo se
borra en el `catch` de un error **atrapado** (`:84`). Si la función **se cae o expira** (timeout de
Vercel, OOM, o `stripe.subscriptions.retrieve` colgado) entre el insert y el `catch`, el marcador
**queda**, y todos los reintentos de Stripe cortan en el chequeo de idempotencia devolviendo
`200 duplicate` sin volver a aplicar el efecto.
- **Resultado:** en `checkout.session.completed`, el cliente **pagó, nunca subió a Pro, y el
  sistema jamás se auto-corrige.** Dinero cobrado, valor no entregado.
- **Reproducir:** simular timeout/kill del handler tras el insert de `stripe_events` y antes del
  `update profiles` (p.ej. latencia alta en `subscriptions.retrieve`). Reintento de Stripe → 200
  duplicate → plan sigue `free`.
- **Mitigación:** marcar idempotencia **solo tras procesar con éxito**, o usar estado
  (`processing`/`done`) y permitir reprocesar filas que no estén `done`. Nunca "marcar-antes" en un
  webhook de pagos.

### B2 — `/api/checkout` no impide una 2ª suscripción → doble cobro. [Áreas 3 y 4]
`app/api/checkout/route.js` nunca comprueba si el usuario **ya** tiene suscripción activa. Además,
mientras no exista fila en `subscriptions` (la crea el webhook, con lag), cada checkout usa
`customer_email` → Stripe crea un **customer nuevo cada vez**.
- **Reproducir:** (a) usuario Pro con `usage` aún en cache "free" (lag del webhook justo tras
  pagar) hace clic en pagar otra vez → **2ª suscripción, 2º cargo**; (b) abre 2 pestañas y completa
  ambas → 2 customers + 2 subs. La UI mitiga el caso común (ya-Pro ve portal), pero el server no
  tiene defensa alguna.
- **Impacto:** doble cobro → contracargos, reseñas 1★, disputas.
- **Mitigación:** en `/api/checkout`, si `profiles.plan='premium'` o hay sub activa → redirigir a
  portal / bloquear; crear-o-reusar el `stripe_customer_id` **eagerly** y persistirlo aquí (no
  depender solo del webhook).

---

## 🟠 MAYOR

### M1 — Eventos fuera de orden: `subscription.updated/deleted` usan el payload del evento, no el estado autoritativo. [Área 3]
El diseño §4 exige "leer el estado autoritativo (retrieve) en cada evento". El código lo hace para
`checkout.completed` e `invoice.*`, pero en `customer.subscription.updated`/`deleted`
(`webhook:62-64`) sincroniza desde `event.data.object` (estado al **crearse** el evento). Stripe
entrega eventos **desordenados**.
- **Reproducir:** un `updated(active)` demorado que llega **después** de `deleted(canceled)`
  → el usuario recupera Pro gratis; o al revés, un pagador queda en Free.
- **Mitigación:** hacer `stripe.subscriptions.retrieve` también aquí, o guardar/compare por
  `updated_at`/`status_transitions` y no regresar a un estado más viejo.

### M2 — Si `/api/usage` falla al cargar, se bloquea el análisis para Free-con-saldo Y para Pro (paywall falso). [Áreas 1, 4]
`app/page.js:loadUsage` traga el error y deja `usage=null`. En `AddMealModal:34`
`canAnalyze = usage?.plan==='pro' || (usage?.remaining ?? 0) > 0` → con `usage=null` da **false**
para todos. Al pulsar Analizar → `setBlocked(true)` → **paywall**, aunque el usuario sea Pro o tenga
créditos. Alta frecuencia en red móvil inestable.
- **Reproducir:** bloquear `/api/usage` (offline momentáneo), luego intentar analizar → paywall
  indebido; un usuario **Pro ve el muro de pago**.
- **Mitigación:** si el estado de cuota es desconocido, **permitir** el intento y dejar que el 429
  del server decida (el server es la fuente de verdad).

### M3 — El portal es inalcanzable si aún no hay fila en `subscriptions` → el pagador no puede cancelar. [Áreas 3, 4]
`app/api/portal/route.js:22` devuelve 400 "No tienes una suscripción activa" cuando falta
`stripe_customer_id`. Si el webhook se atrasó/falló (ver B1), un usuario que **sí pagó** no puede
abrir el portal para gestionar/cancelar → se siente atrapado pagando.
- **Mitigación:** fallback: ubicar el customer de Stripe por email si no hay fila; y arreglar B1.

### M4 — El reanálisis se anuncia "solo Pro" pero se ofrece a Free y le consume un 2º crédito en silencio. [Áreas 1, 2]
La tabla de `UpgradeModal` dice *Reanálisis con corrección: Free —, Pro ✅*, pero
`AddMealModal` muestra la caja "🔁 Reanalizar" a **todos** los que llegaron a `phase==='edit'`.
Un usuario Free que corrige gasta **otro** de sus 10 (el server cobra/​bloquea correctamente, así
que **no es un bypass**, pero sí rompe la promesa y sorprende con un cargo de cuota).
- **Mitigación:** ocultar/gate el reanálisis para Free (coherente con el marketing) o avisar el
  costo antes de reanalizar.

---

## 🟡 MENOR

- **m1 — `current_period_end` depende del pin de API.** Con `2025-01-27.acacia` el campo existe en
  el objeto Subscription (OK hoy). En versiones más nuevas (basil) se movió a los *items*; un futuro
  bump de SDK/apiVersion dejaría `current_period_end=null` → se rompe el texto "sigues Pro hasta fin
  de periodo" y el `subscriptions.current_period_end`. Fijar/verificar al actualizar Stripe.
- **m2 — Pro por cualquier sub activa, sin validar `price_id`.** Si mañana hay más productos/precios,
  una sub no-Pro otorgaría Pro. Hoy hay un solo precio → bajo. Validar `price_id === STRIPE_PRICE_PRO`.
- **m3 — Aviso 80% usa periodo UTC** (`new Date().toISOString().slice(0,7)`, `page.js:42`) mientras
  el periodo real es `America/Mexico_City` → cerca del cambio de mes el flag local puede disparar el
  aviso en el mes equivocado. Cosmético.
- **m4 — "Registrar a mano" desde el paywall pierde la foto adjunta.** `enterManual` arma
  `EMPTY_FORM` (image:''), no adjunta la foto que el usuario ya eligió; Product pedía adjuntarla.
- **m5 — Footgun de orden de deploy:** re-correr `supabase/schema.sql` DESPUÉS de
  `monetizacion.sql` revierte `consumir_analisis` a "premium = ilimitado" (pierde la rama
  `pro_limit`). Documentar que `monetizacion.sql` va **último** / es la versión canónica.
- **m6 — `allow_promotion_codes: true`** sin control server-side: un cupón 100%-off (si existe)
  daría Pro gratis. Ops: cuidar qué cupones se crean en Stripe.
- **m7 — `invoice.payment_succeeded`** se maneja en código pero no está en los eventos configurados
  del webhook (§D lista hasta `invoice.paid`). Rama muerta e inofensiva (cubierta por `invoice.paid`).
- **m8 — `plan` arbitrario en `/api/checkout`:** `{plan:'annual'}` cae a `PRICES.monthly` (fallback)
  → cobra mensual. Sin daño (price viene de env), pero conviene rechazar planes desconocidos.

---

## Recorrido por área (resumen del pedido de Lugia)

1. **Paywall (badge, aviso 80%, modal 3 salidas, gate pre-IA, manual):** funciona; gate pre-IA
   correcto. Fallos: **M2** (paywall falso si usage no carga), **M4** (reanálisis Free), m3, m4.
2. **Free vs Pro / no exceder:** **CONFIRMADO** — Free jamás pasa de 10 (lock atómico intacto),
   Pro usa `pro_limit=1000`. Sólido.
3. **Suscripción (checkout / ?upgraded=1 / portal / cancelación):** `?upgraded=1` y "mantener Pro
   hasta fin de periodo" cableados. Fallos: **B1** (pago sin Pro), **B2** (doble cobro), **M1**
   (fuera de orden), **M3** (portal inalcanzable).
4. **Bordes (doble clic, cerrar modal, sin saldo, cambio de plan, red caída):** doble clic → cubierto
   por **B2**; cerrar modal OK; sin saldo OK; cambio de plan → m8; red caída → **B1/M2/M3**.
5. **`consumir_analisis` no rompe el candado:** **CONFIRMADO** — solo cambió la rama de plan; Free
   sigue en 10, atomicidad/airbag/idempotencia intactos.

---

## Veredicto

**No exponer a producción hasta cerrar B1 y B2** (correctitud de dinero: pago-sin-Pro y
doble-cobro). **M1–M3** deben ir antes o inmediatamente después (entitlement erróneo y pagador
que no puede analizar/cancelar). La base —firma, service_role acotado, RLS, candado atómico de
Free, gate pre-IA— está **bien construida**; lo que falta es robustez del webhook y defensa en
profundidad en checkout/portal.
