import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, resolvePriceId, ALLOWED_PLANS } from '@/lib/stripe';

// Crea una sesión de Stripe Checkout (modo suscripción) para el usuario autenticado.
// Devuelve { url } para redirigir. El plan lo activará el webhook al confirmarse el pago.
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Inicia sesión para suscribirte.' }, { status: 401 });
  }

  // (m8) Validar el plan: solo valores permitidos, sin fallback silencioso.
  let plan = 'monthly';
  try {
    const body = await request.json();
    if (body?.plan) plan = String(body.plan);
  } catch {
    // sin body → mensual por defecto
  }
  if (!ALLOWED_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'Plan no válido.' }, { status: 400 });
  }
  const priceId = resolvePriceId(plan);
  if (!priceId) {
    console.error('Falta el Price ID de Stripe para el plan:', plan);
    return NextResponse.json({ error: 'La suscripción no está disponible en este momento.' }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  try {
    const stripe = getStripe();

    const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // (N1) No confiar en el customer_id guardado sin verificar PROPIEDAD: la RPC eager
    // podría haber inyectado un id ajeno. Solo se reusa si metadata.user_id coincide.
    let customerId = null;
    if (sub?.stripe_customer_id) {
      try {
        const c = await stripe.customers.retrieve(sub.stripe_customer_id);
        if (!c?.deleted && c?.metadata?.user_id === user.id) customerId = c.id;
      } catch {
        // customer inexistente/eliminado → se crea uno nuevo abajo
      }
    }

    // (B2) Si ya es Pro y el customer es suyo, mandarlo al portal a gestionar su plan.
    if (profile?.plan === 'premium' && customerId) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${siteUrl}/`,
      });
      return NextResponse.json({ url: portal.url, portal: true });
    }

    // (B2) Customer eager: crear y PERSISTIR el customer antes del checkout para no
    // duplicar clientes/suscripciones por lag del webhook o 2 pestañas.
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      // Persiste vía RPC SECURITY DEFINER (no pisa si ya existe; sin service_role aquí).
      await supabase.rpc('vincular_stripe_customer', { p_customer_id: customer.id });
      // Manejar la carrera de 2 pestañas SIN 500 (B2 residual + UNIQUE en BD): re-leer la
      // fila; si otra pestaña ya fijó un customer, usamos ESE y convergemos (el nuevo queda
      // huérfano, sin efecto). El UNIQUE impide 2 filas con el mismo customer.
      const { data: after } = await supabase
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle();
      customerId = after?.stripe_customer_id || customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer: customerId,
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${siteUrl}/?upgraded=1`,
      cancel_url: `${siteUrl}/?checkout=cancel`,
      allow_promotion_codes: false, // (m6) evita cupón 100% = Pro gratis
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Error al crear Checkout:', err);
    return NextResponse.json({ error: 'No se pudo iniciar el pago. Intenta de nuevo.' }, { status: 502 });
  }
}
