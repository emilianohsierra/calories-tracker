# Paso E — Diseño: Monetización con Stripe (freemium → Pro)

**De:** Torvalds (CTO) · **Para:** Lugia (Director) → Emiliano
**Estado:** DISEÑO **APROBADO** por el Director (con candados). **No codificado.** Espero luz verde final (precio de Finance + OK de Emiliano) para empezar. ✅ = decisión resuelta.
**Alinea con:** `plan/E-monetizacion-producto.md` (Product/UX) — el límite aplica **solo al análisis con foto**; el registro manual es gratis e ilimitado; el modal de límite salta **antes** de llamar a la IA.
**Objetivo:** cobrar YA. Mantener Free (10 análisis IA/mes) y agregar **Pro** por suscripción mensual (~US$4.99) con cuota alta o ilimitada con tope justo.
**Principio rector:** **reutilizar** la arquitectura de límites que ya existe y está validada (`profiles.plan`, `app_config`, `consumir_analisis`, RLS). Stripe solo **cambia el `plan` del usuario**; el motor de límites ya sabe qué hacer con él.

---

## Changelog v3 — arreglos de QA (Nielsen) + seguridad (Ford)
Todos aplicados; `npm run build` en verde. Sin ir a producción; pendiente re-QA.
- **B1** idempotencia por estado: `stripe_events.status` ('processing'→'done'); se marca `done` SOLO tras éxito; un fallo deja `processing` y devuelve 500 → Stripe reintenta.
- **B2** doble cobro: si ya es premium → Portal (no 2º checkout); customer creado y **persistido eager** (RPC `vincular_stripe_customer`, sin service_role en checkout).
- **A1** el webhook exige `event.livemode === (llaves live)` → ignora eventos de test en prod (nada de Pro real con tarjeta 4242).
- **M1** `subscription.updated/deleted` releen estado autoritativo con `retrieve` (no otorga/quita Pro por evento viejo).
- **A2** anti-clobber: no degradar a Free si el evento es de una suscripción distinta a la vigente guardada.
- **m2** solo `ourPriceIds()` (nuestro precio Pro) concede premium.
- **m5** orden de ejecución documentado en `monetizacion.sql` y aviso en `schema.sql`.
- **m6** `allow_promotion_codes: false` (cupón 100% ≠ Pro gratis).
- **M2** cliente: si `/api/usage` falla no se bloquea (sin paywall falso); decide el 429 del servidor.
- **M3** portal con gracia: si no hay fila `subscriptions`, busca el customer en Stripe por email.
- **M4** reanálisis solo-Pro (UI lo oculta para Free) → promesa alineada.
- **A3** `/api/analyze` errores genéricos (sin nombres de env/modelos); detalle solo en logs.
- **A4** `syncSubscription` sin `.or()` interpolado → filtros `.eq` parametrizados.
- **m1** sin apiVersion en conflicto; `current_period_end` leído defensivo (items[0] ?? subscription).
- **m3** aviso 80% en `America/Mexico_City`. **m7** rama `invoice.payment_succeeded` eliminada. **m8** plan validado. **m4** (menor) manual no sube foto: conocido.

---

## 0) Por qué esto encaja casi sin fricción

Ya tenemos lo difícil hecho:
- `profiles.plan` (`'free' | 'premium'`) — el usuario **no** lo puede cambiar (RLS solo-SELECT, H6b).
- `consumir_analisis` ya resuelve el límite por `plan`: hoy `premium` = ilimitado, `free` = `app_config.free_limit`.
- `app_config` ya centraliza los números (server-side, imposible de falsificar).

**Entonces monetizar = "una fuente confiable que ponga `plan='premium'` cuando el usuario paga y lo regrese a `'free'` cuando deja de pagar".** Esa fuente es el **webhook de Stripe**. Nada más toca la lógica de cuotas.

> **Naming (✅ VB-E1):** valor interno **`'premium'`** (reutiliza `consumir_analisis` sin tocar el `check`); marca comercial **"Pro"**. No se renombra (evita churn).

---

## 1) Modelo de planes y cuota Pro

| Plan | Valor interno | Límite IA/mes | Cómo se aplica |
|---|---|---|---|
| Free | `free` | `app_config.free_limit` (=10) | ya funciona |
| Pro  | `premium` | `app_config.pro_limit` (**alto y finito**, ej. 1000) o `NULL` = ilimitado | nuevo campo |

**✅ VB-E2:** Pro = **alto pero finito** (`pro_limit`, **arranca en 1000/mes**), **no** ilimitado literal. Se **comunica como "ilimitado (uso justo)"**. Motivo: una cuenta Pro comprometida o un bug no drena el crédito; 1000/mes cubre de sobra el uso real (≈33/día) y el **airbag global** sigue como segundo tope. El número exacto lo afina **Buffett Finance** — es solo `update app_config set pro_limit = N;`, no bloquea la implementación.

---

## 2) Cambios de esquema (propuestos — ⛔ NO EJECUTAR aún)

```sql
-- (a) Cuota Pro en la config central (reusa app_config).
alter table public.app_config add column if not exists pro_limit int;  -- NULL = ilimitado
update public.app_config set pro_limit = 1000 where id = true;         -- valor inicial

-- (b) Suscripciones: fuente de verdad de la facturación (detalle + auditoría).
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text,          -- active|trialing|past_due|canceled|unpaid
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,  -- Product: cancelar mantiene Pro hasta fin de periodo
  updated_at             timestamptz not null default now()
);

-- (c) Idempotencia de webhooks: no procesar dos veces el mismo evento de Stripe.
create table if not exists public.stripe_events (
  id         text primary key,          -- event.id de Stripe
  type       text,
  created_at timestamptz not null default now()
);

-- (d) RLS: el usuario puede LEER su suscripción (para mostrar estado); NUNCA mutarla.
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;  -- sin políticas = sin acceso cliente
drop policy if exists subs_select_own on public.subscriptions;
create policy subs_select_own on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.subscriptions, public.stripe_events from anon, authenticated;
grant select on public.subscriptions to authenticated;
-- La ESCRITURA de subscriptions/profiles.plan/stripe_events la hace SOLO el webhook
-- con service_role (bypassa RLS). Ver §4.
```

**Cambio en `consumir_analisis`** (una línea de la rama de plan):
```sql
-- antes:  if v_plan = 'premium' then v_limit := null;  ...
-- después:
--   select free_limit, pro_limit, global_monthly_cap, kill_switch into ... ;
--   if v_plan = 'premium' then v_limit := v_pro_limit;   -- NULL o finito según app_config
--   else                        v_limit := v_free_limit; end if;
```
Todo lo demás de la función (atomicidad, airbag, idempotencia) queda igual.

---

## 3) Flujo de compra — Stripe Checkout (modo suscripción)

**Ruta nueva `POST /api/checkout`** (autenticada, sesión Supabase):
1. `getUser()` → 401 si no hay sesión.
2. Reusar/crear el `stripe_customer_id` del usuario (si no existe, `stripe.customers.create({ email })` y guardarlo).
3. `stripe.checkout.sessions.create({ mode: 'subscription', line_items: [{ price: STRIPE_PRICE_PRO, quantity: 1 }], customer, client_reference_id: user.id, success_url, cancel_url })`.
4. Devolver `{ url }`; el cliente hace `window.location = url`.

`client_reference_id = user.id` es el hilo que conecta el pago de Stripe con el usuario de Supabase en el webhook. `success_url`/`cancel_url` usan `NEXT_PUBLIC_SITE_URL`.

**UI:** botón **"Mejorar a Pro"** (visible en Free, y destacado al llegar al 429 de límite) → llama `/api/checkout` → redirige a Stripe. Al volver por `success_url`, se refresca el estado (el plan ya lo habrá puesto el webhook).

---

## 4) Webhook seguro — `POST /api/stripe/webhook`

Endpoint **público** (lo llama Stripe, sin sesión Supabase). Blindaje:

1. **Verificar firma (obligatorio):** leer el **body crudo** (`await request.text()`, sin parsear JSON antes) + header `stripe-signature`, y `stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET)`. Si falla → **400** y no se procesa. Esto impide que un tercero falsifique "pagos". *(Nota Next: la ruta lee el texto crudo; App Router no interfiere si no llamamos `request.json()`.)*
2. **Idempotencia:** `insert into stripe_events(id,type) values(event.id,...) on conflict do nothing`. Si ya existía (0 filas) → evento repetido → responder **200** sin re-procesar. Stripe reintenta; no debemos duplicar efectos.
3. **Manejo de estados** (mapa plan efectivo):

| Evento Stripe | Acción |
|---|---|
| `checkout.session.completed` | Leer `client_reference_id` (=user.id) + `subscription`; traer la suscripción; guardar en `subscriptions`; `plan='premium'` si `status ∈ {active,trialing}`. |
| `customer.subscription.updated` | Actualizar `subscriptions.status/current_period_end`; `plan='premium'` si `active|trialing|past_due` (gracia); `plan='free'` si `canceled|unpaid`. |
| `customer.subscription.deleted` | `status='canceled'`, `plan='free'`. |
| `invoice.payment_failed` | Marcar `past_due` (se mantiene Pro durante la gracia que Stripe reintenta). |
| `invoice.paid` / `...payment_succeeded` | Asegurar `active` + `plan='premium'`. |

4. **Escritura con `service_role`** (✅ VB-E3, aprobado con candados):

> ### 🔒 `SUPABASE_SERVICE_ROLE_KEY` — ÚNICA excepción permitida al "sin service_role en runtime"
> El webhook es la **única** parte del sistema autorizada a usar service_role. **Por qué es necesario:** el webhook lo llama **Stripe**, no un usuario → **no hay sesión de Supabase** ni `auth.uid()`, así que no puede pasar por RLS como los demás endpoints; y `profiles.plan` es justamente una columna que el usuario **no** puede mutar (H6b), por lo que la escritura tiene que venir de un rol que salte RLS. **Qué lo hace seguro:** quien dispara la escritura es Stripe, y su identidad se prueba con la **verificación de firma** (paso 1) **antes** de tocar la DB.
> **Candados (obligatorios):**
> 1. Solo se usa en `app/api/stripe/webhook/route.js`. **En ningún otro archivo.**
> 2. Solo variable de **servidor** (`SUPABASE_SERVICE_ROLE_KEY`); **jamás** `NEXT_PUBLIC_`, jamás enviada al navegador.
> 3. La **verificación de firma es obligatoria y va ANTES de cualquier escritura**; si la firma no valida, se responde 400 y no se toca la DB.
> 4. El cliente admin (`lib/supabase/admin.js`) se importa **exclusivamente** desde el webhook.

Con service_role, el webhook escribe `profiles.plan` y `subscriptions` (bypassa RLS de forma controlada).
5. Responder **200** rápido (Stripe marca entregado). Errores internos → 500 para que Stripe reintente.

**Robustez de orden:** los eventos pueden llegar desregulados; en cada evento relevante se lee el estado autoritativo de la suscripción (del objeto del evento o `stripe.subscriptions.retrieve`) y se refleja, en vez de asumir transiciones.

---

## 5) Portal de cliente (cancelar / cambiar tarjeta) — opcional

**Ruta `POST /api/portal`** (autenticada, ✅ VB-E5 aprobado — se incluye ya) → `stripe.billingPortal.sessions.create({ customer, return_url })` → portal hospedado de Stripe donde el usuario **cancela (`cancel_at_period_end`)** o cambia su tarjeta. Los cambios llegan por webhook. Cubre el requisito de Product: cancelar **no** revoca Pro de inmediato — se mantiene hasta fin de periodo y luego baja a Free (lo refleja `subscriptions.cancel_at_period_end` + `current_period_end`).

---

## 6) Variables de entorno (nuevas)

| Name | Ejemplo | Dónde | Nota |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` / `sk_live_...` | Vercel (server) | secreta |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Vercel (server) | firma del webhook; distinta en test/prod y por endpoint |
| `STRIPE_PRICE_PRO` | `price_...` | Vercel (server) | id del precio Pro recurrente |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Vercel (server) | **solo webhook**, nunca `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | `https://<app>.vercel.app` | Vercel | success/cancel/return URLs |

Ninguna de estas (salvo `NEXT_PUBLIC_SITE_URL`) se expone al navegador. Se necesita `npm i stripe`.

---

## 7) Archivos a crear / modificar (cuando apruebes)

**Crear:** `supabase/stripe.sql` (esquema §2), `lib/stripe.js` (cliente Stripe server), `lib/supabase/admin.js` (cliente service_role, solo servidor), `app/api/checkout/route.js`, `app/api/stripe/webhook/route.js`, `app/api/portal/route.js` (si VB-E5), UI de upgrade (`app/pro/page.js` o modal + botón en `app/page.js`).
**Modificar:** `supabase/schema.sql` → `consumir_analisis` (rama `pro_limit`) + `app_config.pro_limit`; `app/page.js`/badge (mostrar "Pro" y CTA de upgrade); `app/api/usage/route.js` (reflejar `pro_limit`/ilimitado); `.env.local.example`; `package.json` (stripe).

---

## 8) Orden de implementación
1. Esquema (`stripe.sql` + `pro_limit` + `consumir_analisis`). *Test: poner plan='premium' a mano → cuota Pro aplica.*
2. `lib/stripe.js` + `lib/supabase/admin.js` + `/api/checkout`. *Test local con Stripe test mode + tarjeta 4242.*
3. `/api/stripe/webhook` (firma + idempotencia + mapa de estados). *Test con Stripe CLI.*
4. UI de upgrade + reflejar plan. 5. `/api/portal` (si aplica). 6. Deploy + webhook de producción.

---

## 9) Riesgos
| Riesgo | Mitigación |
|---|---|
| Webhook falsificado | Verificación de firma obligatoria (§4.1). |
| Evento duplicado (doble upgrade/cobro de efecto) | Tabla `stripe_events` + `on conflict do nothing`. |
| Eventos fuera de orden | Leer estado autoritativo de la suscripción en cada evento. |
| service_role filtrada | Solo server, solo webhook, nunca `NEXT_PUBLIC_`; rota si se expone. |
| Usuario paga pero no sube de plan | Reintentos de Stripe + idempotencia; el portal y el estado en `subscriptions` permiten diagnosticar. |
| Pro drena crédito | `pro_limit` finito (VB-E2) + airbag global. |

---

## 10) Decisiones (todas resueltas por el Director)
- **✅ VB-E1:** `'premium'` interno = "Pro" comercial. No renombrar.
- **✅ VB-E2:** `pro_limit` finito, arranca 1000/mes; se comunica como ilimitado (uso justo). Finance afina el número.
- **✅ VB-E3:** `SUPABASE_SERVICE_ROLE_KEY` **solo en el webhook**, con los 4 candados (§4). Única excepción permitida.
- **✅ VB-E4:** precio **99 MXN/mes** (aprobado por Emiliano). Anual (799 MXN) = **fast-follow**: el código se estructura para un 2º Price ID, pero el MVP sale **solo mensual**. Gracia en `past_due` aprobada.
- **✅ VB-E5:** Customer Portal incluido desde ahora (cubre `cancel_at_period_end`).

---

## 11) Alineación con Product (`plan/E-monetizacion-producto.md`)
- **El límite aplica SOLO al análisis con foto (IA).** El **registro manual es gratis e ilimitado** → se agrega un **modo manual** en el modal (formulario vacío, sin llamar a la IA); nunca pasa por `consumir_analisis`.
- **Gate antes de la IA (doble):** el cliente **pre-verifica** el saldo (`/api/usage`) y, si Free llegó a 0, muestra el **modal de límite ANTES** de llamar a `/api/analyze` (no gasta la llamada). El **429 del servidor** (reserva atómica) queda como respaldo (defensa en profundidad).
- **Modal de límite (11º intento)** con 3 salidas en orden: **Hazte Pro** (CTA) · **Registrar a mano** (abre el manual con la foto adjunta) · **Cerrar** ("se reinicia el 1 de [mes]").
- **Badge** "N/10 análisis IA" (ámbar cuando ≤3), clic → tabla Free vs Pro / checkout.
- **Post-pago:** al volver por `success_url` (con `?upgraded=1`) se muestra confirmación "¡Ya eres Pro!".
- **Aviso 80%** (una vez/mes): MVP con flag local por periodo; persistencia server-side = fast-follow.
- **Fast-follow de feature-gates de Product** (no en este MVP, se anotan): reanálisis solo-Pro, modelo avanzado, metas de macros, export CSV, historial completo, plan anual.

---

## 12) ORDEN DE IMPLEMENTACIÓN (luz verde dada)
1. **`supabase/monetizacion.sql`** (lo corre **Emiliano**, no el CTO): `app_config.pro_limit` (=1000), tabla `subscriptions` (+`cancel_at_period_end`), tabla `stripe_events`, y `create or replace consumir_analisis` con la rama `pro_limit`. *Test: poner plan='premium' a mano → cuota Pro aplica.*
2. **`/api/checkout`** + `lib/stripe.js` (estructurado para monthly ahora, annual después). *Test: Stripe test mode + 4242.*
3. **`/api/stripe/webhook`** + `lib/supabase/admin.js`: firma → idempotencia (`stripe_events`) → mapa de estados → escritura service_role. *Test: Stripe CLI.*
4. **`/api/portal`** (cancelar/tarjeta).
5. **UI del paywall** (badge, modal de upgrade con tabla Free vs Pro, gate pre-IA, modo manual, confirmación post-pago) según Product.
6. **Guía** para Emiliano (§ de abajo, actualizada a 99 MXN mensual).

> **No va directo a producción:** al terminar lo revisa **Nielsen QA** + pasada de seguridad del Director al flujo de pago y webhook, antes de exponer.

---
---

# GUÍA PARA EMILIANO — Stripe paso a paso (para después de tu aprobación)

> Tan detallada como la de deploy. **La ejecuta Emiliano con su cuenta.** El CTO no toca cuentas de Stripe.

### A) Crear cuenta y activar modo prueba
1. Ir a **stripe.com** → **Start now / Sign up** (email + contraseña). No hace falta activar la cuenta (dar datos de negocio) para **modo prueba**.
2. Arriba a la derecha, activar el interruptor **"Test mode"** (modo prueba). Todo lo de abajo se hace primero en **Test**.

### B) Crear el producto y el precio Pro
1. **Product catalog** (Catálogo de productos) → **Add product**.
2. Nombre: `Pro`. Descripción opcional.
3. En **Pricing**: **Recurring** (recurrente), **Monthly** (mensual), moneda **MXN**, importe **99** (99 MXN/mes). *(El plan anual de 799 MXN se agrega después como 2º Price ID — el código ya está estructurado para ello; el MVP es solo mensual.)*
4. **Save**. Abre el precio creado y copia el **API ID** que empieza con **`price_...`** → ese es `STRIPE_PRICE_PRO`.

### C) Sacar las llaves de API (test)
1. **Developers → API keys**.
2. Copiar **Secret key** (`sk_test_...`) → `STRIPE_SECRET_KEY`. *(La "Publishable key" no la usamos: el checkout se crea en el servidor.)*

### D) Configurar el webhook (test)
1. **Developers → Webhooks → Add endpoint**.
2. **Endpoint URL:** `https://<tu-app>.vercel.app/api/stripe/webhook`.
3. **Select events**: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`.
4. **Add endpoint** → abre el endpoint → **Signing secret** → copiar (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.
   - *(Para probar en localhost:)* instalar **Stripe CLI**, correr `stripe login`, luego `stripe listen --forward-to localhost:7350/api/stripe/webhook`; la CLI imprime un `whsec_...` **local** para usar en `.env.local`.

### E) Poner las llaves en Vercel (test primero)
1. Vercel → **Project → Settings → Environment Variables**. Agregar con nombres EXACTOS, sin espacios/comillas:
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API → **service_role**, ⚠️ la secreta), `NEXT_PUBLIC_SITE_URL` (tu URL de Vercel).
2. **Redeploy** (las env se aplican en el próximo build).

### F) Probar el pago (test)
1. En la app, botón **Mejorar a Pro** → Checkout de Stripe.
2. Tarjeta de prueba: **`4242 4242 4242 4242`**, fecha futura, CVC cualquiera, ZIP cualquiera.
3. Pagar → volver a la app → el plan debe pasar a **Pro** (lo pone el webhook). Verificar en Supabase: `profiles.plan='premium'` y una fila en `subscriptions`.
4. Probar cancelación (Portal, si está) → el plan vuelve a Free tras el evento.

### G) Pasar a PRODUCCIÓN (cuando funcione en test)
1. En Stripe, **apagar Test mode** (interruptor). Verás el panel **Live**.
2. Repetir **B, C, D** en modo **Live**: recrear el producto/precio Pro (nuevo `price_...` live), sacar `sk_live_...`, crear el webhook **live** con la misma URL y sacar su `whsec_...` live.
3. Actualizar en Vercel las 3 llaves de Stripe con los valores **live** (`sk_live_...`, `price_...` live, `whsec_...` live). `SUPABASE_SERVICE_ROLE_KEY` y `NEXT_PUBLIC_SITE_URL` no cambian.
4. **Redeploy.** Activar tu cuenta Stripe (datos de negocio + cuenta bancaria) para poder **recibir pagos reales y cobrar**.
5. Hacer un cobro real de prueba pequeño (o con tu propia tarjeta) y luego reembolsarlo desde Stripe.

### Checklist
- [ ] Producto Pro creado; `price_...` copiado
- [ ] `sk_...`, `whsec_...`, `price_...`, `service_role`, `NEXT_PUBLIC_SITE_URL` en Vercel; **Redeploy**
- [ ] Pago test con 4242 → plan pasa a Pro; fila en `subscriptions`
- [ ] Cancelación → vuelve a Free
- [ ] Repetido en **Live** + cuenta activada para cobrar

> El CTO no ejecuta esto. Si un paso falla, me pasas el error (Vercel Logs o Stripe → Developers → Events/Logs) y lo diagnostico.
