# RE-QA de monetización Stripe (Paso E · Changelog v3) — verificación de cierres

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Alcance:** re-verificación contra el código real tras los arreglos del CTO (changelog v3) +
pasada de seguridad (Ford). Archivos releídos: `app/api/stripe/webhook/route.js`,
`app/api/checkout/route.js`, `app/api/portal/route.js`, `lib/stripe.js`,
`supabase/monetizacion.sql`, `components/AddMealModal.js`, `app/page.js`.

---

## VEREDICTO: ✅ LISTO-PARA-PROD (con 1 endurecimiento recomendado, NO bloqueante)

Los 2 bloqueantes de DINERO y los 4 mayores están **cerrados y verificados en código**. El candado
Free de 10 y `consumir_analisis` siguen **intactos**. Aparece **1 hallazgo nuevo** de bajo riesgo
práctico (N1) que recomiendo cerrar antes de escalar, pero **no** frena el lanzamiento porque no es
explotable con datos que la app exponga.

---

## Cierres verificados (uno por uno)

### 💰 DINERO

**B1 — Idempotencia por estado `processing`→`done`. ✅ CERRADO.**
`webhook:48-58` lee `status`; si `done` → 200 sin reprocesar. Si no existe o quedó `processing`
(intento caído), hace `upsert status='processing'`, procesa, y **solo tras éxito** pone `done`
(`:93`). En error → se queda `processing` y devuelve 500 → Stripe reintenta y **sí** reprocesa
(`:96-97`). Ya no hay "pagó y nunca subió a Pro". La tabla trae la columna `status`
(`monetizacion.sql:36-39`). Verificado.

**B2 — Doble cobro / customer duplicado. ✅ CERRADO.**
`checkout:46-52`: si `profiles.plan='premium'` + customer → redirige al **Portal**, no crea 2º
checkout. `checkout:56-65`: customer creado y **persistido eager** vía RPC
`vincular_stripe_customer` antes del checkout (sin service_role en la ruta). La RPC
(`monetizacion.sql:150-168`) es SECURITY DEFINER, `search_path=''`, usa `auth.uid()`, solo toca la
fila propia y **no pisa** un customer existente. `allow_promotion_codes:false` (m6). Verificado.

### 🟠 MAYORES

**M1 — Estado autoritativo con `retrieve`. ✅ CERRADO.** `webhook:76` — `updated/deleted` ahora
hacen `stripe.subscriptions.retrieve(event.data.object.id)` antes de sincronizar. No se otorga/quita
Pro por un evento viejo.

**M2 — `/api/usage` caído no bloquea. ✅ CERRADO.** `AddMealModal:36` —
`canAnalyze = !usage || plan==='pro' || remaining>0`. Con `usage=null` permite el intento y decide
el 429 del server. Sin paywall falso para Free-con-saldo ni Pro. (El 429 ocurre antes de Claude → no
gasta IA.)

**M3 — Portal con gracia sin fila `subscriptions`. ✅ CERRADO.** `portal:31-34` — si falta el
customer en DB, lo busca en Stripe por `email` (`customers.list`). Un pagador siempre puede
gestionar/cancelar aunque el webhook vaya con lag. Si no hay ninguno → 409 "activando".

**M4 — Reanálisis solo-Pro. ✅ CERRADO.** `AddMealModal:232` — el bloque de reanálisis va tras
`{isPro && rawAnalysis && ...}`; Free ya no lo ve. Alineado con la tabla de planes.

### 🟡 MENORES (verificados)
- **m1** ✅ `lib/stripe.js` ya no fija apiVersion en conflicto; `webhook:136-138` lee
  `current_period_end` defensivo (`items[0] ?? subscription`).
- **m2** ✅ `webhook:132-133` — solo `ourPriceIds()` concede premium (`isOurPrice && PRO_STATES`).
- **m3** ✅ `page.js:43` — aviso 80% con `currentPeriod()` (America/Mexico_City).
- **m5** ✅ orden de ejecución documentado en `monetizacion.sql:4-8`.
- **m6** ✅ `allow_promotion_codes:false`.
- **m7** ✅ rama `invoice.payment_succeeded` eliminada (solo `invoice.paid`/`payment_failed`).
- **m8** ✅ `checkout:24` valida `ALLOWED_PLANS`; `resolvePriceId` devuelve null sin fallback.
- **m4** (manual desde paywall no adjunta foto) — reconocido como conocido/menor. OK.

### 🛡️ Endurecimiento extra de Ford (bonus, verificado)
- **A1** `webhook:38-42` — `event.livemode` debe coincidir con el modo de las llaves → un evento de
  test no da Pro real en prod. Bien.
- **A2** `webhook:142-153` — anti-clobber: no degrada al usuario si el evento es de una suscripción
  distinta a la vigente guardada. Lógica correcta (solo bloquea downgrades de subs ajenas).
- **A4** `webhook:109-123` — fallback por `.eq` parametrizado (sin `.or()` interpolado).

### 🔒 Núcleo de límites (lo que pediste confirmar)
- **`consumir_analisis` INTACTO.** `monetizacion.sql:56-144` — idéntico salvo la rama de plan
  (`premium → v_pro_limit`). Free: `v_limit=free_limit(10)`, mismo `insert … on conflict … where
  count < v_limit` atómico, mismo airbag global, misma idempotencia por `request_id`. **Free sigue
  topado en 10, lock atómico intacto. CONFIRMADO.**
- **RPC nueva `vincular_stripe_customer`** no toca el candado ni el plan; solo escribe
  `stripe_customer_id` propio. No hay regresión en la lógica de cuota.

---

## 🆕 Hallazgo nuevo (introducido por el arreglo B2)

### N1 — MAYOR-condicional / riesgo práctico BAJO · IDOR de facturación vía `vincular_stripe_customer` + `/api/portal`.
La RPC `vincular_stripe_customer(p_customer_id text)` (grant a `authenticated`, llamable directo por
PostgREST) deja que un usuario ponga en **su propia** fila un `stripe_customer_id` **arbitrario**
(mientras esté null). Luego `/api/portal` abre el Billing Portal de Stripe para **ese** customer id.
- **Ataque teórico:** atacante autenticado llama `rpc('vincular_stripe_customer',{p_customer_id:'cus_VICTIMA'})`
  y luego `POST /api/portal` → abre el portal de la VÍCTIMA (ver tarjeta/last4, cancelar su
  suscripción, cambiar método de pago).
- **Por qué NO es bloqueante:** el `cus_...` de otro usuario **no se expone en ningún lado** de la
  app (RLS `select-own` no devuelve `stripe_customer_id`; `/api/usage` tampoco). Sin un oráculo para
  obtener el id de la víctima, el ataque no es realizable desde el producto. Impacto alto pero
  probabilidad práctica baja.
- **Mitigación (barata, recomendada ANTES de escalar):** en `/api/portal` (y antes de linkear),
  verificar propiedad: el customer de Stripe ya se crea con `metadata.user_id` (`checkout:60`), así
  que basta comprobar `customer.metadata.user_id === user.id` antes de abrir el portal; o no otorgar
  execute de la RPC y persistir el customer por un camino no controlable por el cliente.

---

## Resumen para el Director

| Ítem | Estado |
|---|---|
| B1 pago-sin-Pro | ✅ cerrado |
| B2 doble cobro | ✅ cerrado |
| M1 fuera de orden | ✅ cerrado |
| M2 paywall falso | ✅ cerrado |
| M3 portal sin fila | ✅ cerrado |
| M4 reanálisis Free | ✅ cerrado |
| m1/m2/m3/m5/m6/m7/m8 | ✅ cerrados |
| Free tope 10 + `consumir_analisis` | ✅ intacto |
| A1/A2/A4 (Ford) | ✅ buen extra |
| **N1 IDOR de portal (nuevo)** | ⚠️ recomendado cerrar; no bloqueante |

**LISTO-PARA-PROD.** Recomiendo incluir el fix de N1 en el mismo empujón (1 verificación de
propiedad en `/api/portal`) por ser barato y cerrar la única superficie sensible que queda; pero
si se decide lanzar sin él, el riesgo real es bajo porque el `customer_id` ajeno no es obtenible
dentro del producto.
