import { NextResponse } from 'next/server';
import { getStripe, ourPriceIds } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';

// Webhook de Stripe. Lo llama Stripe (sin sesión de usuario).
// SEGURIDAD (ver plan/E-monetizacion-stripe.md §4):
//  1) Verificación de FIRMA obligatoria ANTES de cualquier escritura.
//  2) event.livemode debe coincidir con el modo de nuestras llaves (A1).
//  3) Idempotencia por event.id con estado 'done' (B1): solo 'done' bloquea reintentos.
//  4) Escritura con service_role acotada EXCLUSIVAMENTE a esta ruta.
export const runtime = 'nodejs'; // Stripe.constructEvent necesita Node crypto + body crudo.

// Estados de suscripción que cuentan como Pro activo (incluye la gracia past_due).
const PRO_STATES = new Set(['active', 'trialing', 'past_due']);

export async function POST(request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers.get('stripe-signature');
  if (!secret || !sig) {
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 400 });
  }

  let event;
  let stripe;
  try {
    stripe = getStripe();
    const rawBody = await request.text(); // body CRUDO, sin parsear
    // (1) Verificar firma. Si falla, se corta aquí: NO se toca la base de datos.
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error('Firma de webhook inválida:', err.message);
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  }

  // (A1) El modo del evento debe coincidir con el modo de NUESTRAS llaves. Así, si por
  // mala config llegan eventos de test a producción (o al revés), se ignoran → nadie
  // obtiene Pro real pagando con una tarjeta de prueba.
  const usingLiveKeys = (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_');
  if (event.livemode !== usingLiveKeys) {
    console.warn(`Evento Stripe ignorado por mismatch de modo (livemode=${event.livemode})`);
    return NextResponse.json({ received: true, ignored: 'mode_mismatch' });
  }

  const admin = createAdminClient();

  // (B1) Idempotencia por estado: si ya está 'done', no re-procesar. Si está a medias
  // ('processing' de un intento caído) o no existe, se (re)procesa.
  const { data: existing } = await admin
    .from('stripe_events')
    .select('status')
    .eq('id', event.id)
    .maybeSingle();
  if (existing?.status === 'done') {
    return NextResponse.json({ received: true, duplicate: true });
  }
  await admin
    .from('stripe_events')
    .upsert({ id: event.id, type: event.type, status: 'processing' }, { onConflict: 'id' });

  // (3) Procesar. El marcador 'done' se pone SOLO tras éxito. Un fallo deja 'processing'
  // y devuelve 500 para que Stripe reintente.
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.user_id;
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await syncSubscription(admin, subscription, userId);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        // (M1) Releer el estado AUTORITATIVO para no otorgar/quitar Pro por un evento viejo.
        const fresh = await stripe.subscriptions.retrieve(event.data.object.id);
        await syncSubscription(admin, fresh, fresh.metadata?.user_id);
        break;
      }
      case 'invoice.payment_failed':
      case 'invoice.paid': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          await syncSubscription(admin, subscription, subscription.metadata?.user_id);
        }
        break;
      }
      default:
        break; // evento no manejado: se marca done abajo y se ignora
    }

    await admin.from('stripe_events').update({ status: 'done' }).eq('id', event.id);
  } catch (err) {
    console.error('Error al procesar webhook Stripe:', err);
    // Se deja en 'processing' (no 'done') → el reintento de Stripe SÍ reprocesa (B1).
    return NextResponse.json({ error: 'Error al procesar' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Refleja el estado de una suscripción de Stripe en Supabase (subscriptions + profiles.plan).
async function syncSubscription(admin, subscription, userIdHint) {
  let userId = userIdHint || subscription.metadata?.user_id || null;

  // Fallback: ubicar al usuario por sub id o customer id. (A4) Filtros parametrizados
  // con .eq (sin interpolar en .or), consultas secuenciales.
  if (!userId) {
    const bySub = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();
    userId = bySub.data?.user_id || null;
    if (!userId && subscription.customer) {
      const byCust = await admin
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', subscription.customer)
        .maybeSingle();
      userId = byCust.data?.user_id || null;
    }
  }
  if (!userId) {
    console.error('Webhook: no se pudo resolver user_id para la suscripción', subscription.id);
    return;
  }

  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  // (m2) Solo NUESTRO precio Pro concede premium; cualquier otra suscripción NO.
  const isOurPrice = ourPriceIds().includes(priceId);
  const isPro = isOurPrice && PRO_STATES.has(subscription.status);

  // (m1) current_period_end: en versiones nuevas de la API se movió a los items.
  const periodEndUnix =
    subscription.items?.data?.[0]?.current_period_end ?? subscription.current_period_end ?? null;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;

  // (A2) Anti-clobber: si el evento es de una suscripción DISTINTA a la guardada y NO
  // concede Pro (cancelación de una 2ª sub), no degradar al usuario cuya sub guardada sigue.
  const current = await admin
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();
  const storedSubId = current.data?.stripe_subscription_id || null;
  if (!isPro && storedSubId && storedSubId !== subscription.id) {
    console.warn(
      `A2: ignorado downgrade de sub ajena ${subscription.id}; la vigente es ${storedSubId}`
    );
    return;
  }

  await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: subscription.customer,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      price_id: priceId,
      current_period_end: periodEnd,
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  await admin
    .from('profiles')
    .update({ plan: isPro ? 'premium' : 'free' })
    .eq('id', userId);

  // Lealtad: sella pro_since en el PRIMER sync a Pro (idempotente: solo si aún es null). Antigüedad Pro
  // para los tramos de lealtad. Best-effort; si la columna/tabla no existe (SQL pendiente), no rompe.
  if (isPro) {
    try {
      await admin.from('subscriptions').update({ pro_since: new Date().toISOString() }).eq('user_id', userId).is('pro_since', null);
    } catch (e) { console.error('[lealtad] pro_since:', e?.message); }
  }
}
