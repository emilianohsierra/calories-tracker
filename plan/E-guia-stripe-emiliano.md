# 💳 Guía Stripe para Emiliano — paso a paso (versión chat)

Hola Emiliano 👋 Vamos a dejar Stripe listo **en modo PRUEBA**. Todo lo de abajo es **seguro hacerlo ahora tú solo** — no cobra a nadie ni afecta la app en vivo. Al final hay unos pasos que hacemos **juntos** (porque el código todavía está en revisión de calidad y seguridad). Ve **un paso a la vez** y no te saltes ninguno. 🙂

> 🔒 **Regla de oro de seguridad:** dos claves son SECRETAS — `STRIPE_SECRET_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. **Nunca** las pegues en un chat, **nunca** las pongas con el prefijo `NEXT_PUBLIC_`, y **nunca** las metas en el código del navegador. Van solo en Vercel (eso lo hacemos juntos). Si alguna vez las pegas por error, avísame y las rotamos.

---

## PARTE A — Segura de hacer AHORA tú solo (modo PRUEBA) ✅

### Paso 1 — Crear tu cuenta de Stripe
1. Entra a **https://stripe.com** → botón **Sign up** (regístrate con tu email y una contraseña).
2. Cuando entres al panel, arriba a la derecha activa el interruptor **"Test mode" / "Modo de prueba"**. Debe quedar **encendido** (naranja). Todo lo de esta parte es en prueba.

### Paso 2 — Crear el producto "Pro" (99 MXN/mes)
1. En el menú, ve a **Product catalog** (Catálogo de productos) → botón **+ Add product**.
2. **Name:** escribe `Pro`.
3. En **Pricing**:
   - **Recurring** (recurrente).
   - **Billing period:** **Monthly** (mensual).
   - **Currency / Moneda:** **MXN**.
   - **Amount / Importe:** **99**.
4. Clic en **Save product** (guardar).
5. Se abre el producto. Busca el precio que creaste y copia su **API ID**: empieza con **`price_...`**.
   👉 Ese valor es **`STRIPE_PRICE_PRO`**. Guárdalo en una nota (este NO es secreto, pero lo necesitaremos).

### Paso 3 — Sacar tu llave secreta de prueba
1. Ve a **Developers** (Desarrolladores) → **API keys**.
2. Verás **Secret key**: empieza con **`sk_test_...`**. Clic en **Reveal** y **cópiala**.
   👉 Ese valor es **`STRIPE_SECRET_KEY`**.
   ⚠️ Es **SECRETA**: guárdala en un lugar privado (un gestor de contraseñas o una nota segura tuya). **No la pegues en el chat.**

### Paso 4 — Crear el webhook (así Stripe le avisa a la app cuando alguien paga)
1. Ve a **Developers** → **Webhooks** → botón **+ Add endpoint**.
2. En **Endpoint URL** pega EXACTAMENTE esto:
   ```
   https://calories-tracker-nine-bice.vercel.app/api/stripe/webhook
   ```
3. En **Select events** (seleccionar eventos), busca y marca estos 5:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.paid`
4. Clic en **Add endpoint**.
5. Se abre el endpoint. Busca **Signing secret** (secreto de firma) → **Reveal** → **cópialo**: empieza con **`whsec_...`**.
   👉 Ese valor es **`STRIPE_WEBHOOK_SECRET`**.

### ✅ Al terminar la Parte A me avisas
Tendrás estos 3 valores guardados (en un lugar privado tuyo, **no en el chat**):
- `STRIPE_PRICE_PRO` → `price_...`
- `STRIPE_SECRET_KEY` → `sk_test_...` (secreta)
- `STRIPE_WEBHOOK_SECRET` → `whsec_...`

Con eso, **me dices "Parte A lista"** y seguimos juntos. 🙌

---

## PARTE B — La hacemos JUNTOS al final 🔧 (NO la hagas todavía)

> Estos pasos tocan la app en vivo, y el código sigue en **revisión de calidad y seguridad**. Los hacemos juntos cuando pase la revisión.

1. **Poner las variables en Vercel** (Project → Settings → Environment Variables), con estos **nombres EXACTOS** (sin espacios, sin comillas):
   - `STRIPE_SECRET_KEY` = tu `sk_test_...`  ⚠️ secreta
   - `STRIPE_WEBHOOK_SECRET` = tu `whsec_...`
   - `STRIPE_PRICE_PRO` = tu `price_...`
   - `NEXT_PUBLIC_SITE_URL` = `https://calories-tracker-nine-bice.vercel.app`
   - `SUPABASE_SERVICE_ROLE_KEY` = (la saco contigo de Supabase → Settings → API → **service_role**)  ⚠️ secreta
2. **Correr el SQL** `supabase/monetizacion.sql` en Supabase (SQL Editor → Run) — crea el plan Pro y las tablas de suscripción.
3. **Redeploy** en Vercel (las variables se aplican en el nuevo build).
4. **Probar el pago en modo prueba** con esta tarjeta de mentira:
   - Número: **`4242 4242 4242 4242`**
   - Fecha: cualquiera futura (ej. 12/34) · CVC: cualquiera (ej. 123) · CP: cualquiera
   - Debe: pagar → volver a la app → tu plan cambia a **Pro**. 🎉
5. **Pasar a modo LIVE (real)** — solo cuando todo funcione en prueba: apagamos "Test mode", recreamos producto/llaves/webhook en **Live**, actualizamos las llaves en Vercel y activamos tu cuenta Stripe (datos de negocio + banco) para **cobrar de verdad**.

---

## Resumen rápido
- **Ahora tú:** crear cuenta → producto Pro 99 MXN → copiar `price_...`, `sk_test_...`, `whsec_...` (guárdalos en privado).
- **Después juntos:** Vercel + SQL + redeploy + probar con 4242 + pasar a Live.
- **Nunca** pegues `STRIPE_SECRET_KEY` ni `SUPABASE_SERVICE_ROLE_KEY` en el chat.

Cuando termines la Parte A, escribe **"Parte A lista"** y seguimos. 💪
