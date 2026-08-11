import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Coach · Proactividad Fase 2 — guardar / borrar la suscripción push del navegador. Scoped al
// usuario de la SESIÓN (getUser) + RLS. Deploy-safe: sin la tabla → error claro sin romper.
export const runtime = 'nodejs';

// POST { endpoint, keys:{ p256dh, auth } }  (formato de PushSubscription.toJSON())
export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 });
    }

    // upsert por endpoint: re-suscribir el mismo navegador actualiza claves/dueño (RLS acota a lo propio).
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: 'endpoint' });
    if (error) {
      console.error('push subscribe:', { code: error.code, details: error.details });
      return NextResponse.json({ error: 'No se pudo suscribir' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('push subscribe EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo suscribir' }, { status: 500 });
  }
}

// DELETE { endpoint }
export async function DELETE(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint) return NextResponse.json({ error: 'Falta endpoint' }, { status: 400 });

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', user.id); // defensa en profundidad además de la RLS
    if (error) {
      console.error('push unsubscribe:', { code: error.code, details: error.details });
      return NextResponse.json({ error: 'No se pudo cancelar' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('push unsubscribe EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo cancelar' }, { status: 500 });
  }
}
