import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Coach · Proactividad Fase 1 — bandeja in-app (LECTURA). Scoped por RLS (auth.uid()).
// GET /api/coach/notifications            → { notifications:[...], unseen:number }
// GET /api/coach/notifications?unseen=1    → solo las no vistas.
// Deploy-safe: sin la tabla → { notifications:[], unseen:0 } (no rompe la UI).
export const runtime = 'nodejs';

const LIMIT = 30; // últimas N; la bandeja no necesita paginación en Fase 1.

export async function GET(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

    const soloNoVistas = new URL(req.url).searchParams.get('unseen') === '1';

    let q = supabase
      .from('coach_notifications')
      .select('id, event_type, titulo, cuerpo, prioridad, visto, created_at')
      .eq('user_id', user.id)
      .order('visto', { ascending: true })          // no vistas primero
      .order('created_at', { ascending: false })    // recientes arriba
      .limit(LIMIT);
    if (soloNoVistas) q = q.eq('visto', false);

    const { data, error } = await q;
    if (error) {
      // Tabla ausente (aún no corre proactividad.sql) → bandeja vacía, sin romper.
      if (error.code === '42P01') return NextResponse.json({ notifications: [], unseen: 0 });
      console.error('notifications GET:', { code: error.code, details: error.details });
      return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
    }

    const notifications = data || [];
    const unseen = notifications.filter((n) => !n.visto).length;
    return NextResponse.json({ notifications, unseen });
  } catch (err) {
    console.error('notifications GET EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
  }
}
