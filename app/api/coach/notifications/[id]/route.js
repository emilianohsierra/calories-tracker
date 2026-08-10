import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Coach · Proactividad Fase 1 — marcar notificación como vista.
// PATCH /api/coach/notifications/:id   body { visto?: boolean }  (default true)
// RLS acota el update a lo propio; el usuario no puede tocar notificaciones ajenas.
export const runtime = 'nodejs';

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const visto = body.visto === undefined ? true : !!body.visto;

    const { data, error } = await supabase
      .from('coach_notifications')
      .update({ visto })
      .eq('id', id)
      .eq('user_id', user.id) // defensa en profundidad además de la RLS
      .select('id, visto')
      .maybeSingle();

    if (error) {
      console.error('notifications PATCH:', { code: error.code, details: error.details });
      return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'No existe' }, { status: 404 });
    return NextResponse.json({ ok: true, id: data.id, visto: data.visto });
  } catch (err) {
    console.error('notifications PATCH EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  }
}
