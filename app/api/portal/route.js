import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

// Abre el Customer Portal hospedado de Stripe (cancelar / cambiar tarjeta).
// M3: un pagador SIEMPRE debe poder cancelar, aunque el webhook aún no haya escrito su
// fila (lag). Si falta el customer en la DB, se busca en Stripe por email.
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  try {
    const stripe = getStripe();

    // 1) customer guardado en la DB.
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    let customerId = sub?.stripe_customer_id || null;

    // 2) Fallback (lag del webhook): ubicar el customer en Stripe por email.
    if (!customerId && user.email) {
      const found = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = found.data?.[0]?.id || null;
    }

    if (!customerId) {
      return NextResponse.json(
        { error: 'Aún estamos activando tu suscripción. Intenta en un momento.' },
        { status: 409 }
      );
    }

    // (N1) Verificar PROPIEDAD antes de abrir el portal: el customer debe pertenecer a
    // este usuario (metadata.user_id se fija al crearlo en /api/checkout). Cierra el hueco
    // del fix B2, donde la RPC permitiría inyectar un customer_id ajeno en la fila propia.
    const customer = await stripe.customers.retrieve(customerId);
    if (customer?.deleted || customer?.metadata?.user_id !== user.id) {
      console.error('Portal: customer no pertenece al usuario', { customerId, userId: user.id });
      return NextResponse.json({ error: 'No pudimos verificar tu suscripción.' }, { status: 403 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Error al abrir el portal:', err);
    return NextResponse.json({ error: 'No se pudo abrir el portal. Intenta de nuevo.' }, { status: 502 });
  }
}
