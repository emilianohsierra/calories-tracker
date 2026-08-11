import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PREFS_DEFAULT, sanitizarPrefs } from '@/lib/coach/prefs';

// Coach · Proactividad — preferencias de notificación del usuario (para la UI de Rams). Scoped por
// sesión (getUser) + RLS. Deploy-safe: sin la tabla → devuelve los defaults / error claro.
export const runtime = 'nodejs';

// GET → { prefs: { modo, quiet_start, quiet_end, proactive_on, on_* } }  (defaults si no hay fila)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

    const { data, error } = await supabase
      .from('coach_notification_prefs')
      .select('modo, quiet_start, quiet_end, proactive_on, on_missed_meal, on_low_protein, on_streak, on_weekly_review, on_user_inactivity')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error && error.code !== '42P01') {
      console.error('prefs GET:', { code: error.code, details: error.details });
      return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
    }
    return NextResponse.json({ prefs: { ...PREFS_DEFAULT, ...(data || {}) } });
  } catch (err) {
    console.error('prefs GET EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
  }
}

// PUT (parcial) → sanea y upsertea; devuelve las prefs efectivas.
export async function PUT(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const patch = sanitizarPrefs(body); // SOLO campos válidos (nunca confía en el cliente)
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });

    const { data, error } = await supabase
      .from('coach_notification_prefs')
      .upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' })
      .select('modo, quiet_start, quiet_end, proactive_on, on_missed_meal, on_low_protein, on_streak, on_weekly_review, on_user_inactivity')
      .maybeSingle();
    if (error) {
      console.error('prefs PUT:', { code: error.code, details: error.details });
      return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
    }
    return NextResponse.json({ prefs: { ...PREFS_DEFAULT, ...(data || {}) } });
  } catch (err) {
    console.error('prefs PUT EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }
}
