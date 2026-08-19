import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { localDateTime } from '@/lib/coach/context';
import { mesesCompletos, proximoTramo } from '@/lib/loyalty/evaluar';
import { tramoDe } from '@/lib/loyalty/tramos';
import { LEALTAD_ON } from '@/lib/loyalty/otorgar';

// Coach · Lealtad (READ, informativo). GET → progreso REAL de antigüedad Pro para la tarjeta de Rams.
// SOLO lectura de subscriptions + loyalty_rewards del propio usuario (RLS own). CERO dinero/PII: no toca
// Stripe ni depende de LEALTAD_GRANT_ON (muestra 'llevas X de 6 meses' aunque el grant siga off).
// Deploy-safe: LEALTAD_ON off / tablas ausentes / excepción → null → la tarjeta se oculta, HOME intacta.
export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    if (!LEALTAD_ON) return NextResponse.json(null); // flag off → tarjeta oculta (deploy-safe)

    const { date: hoy } = localDateTime();

    // pro_since (antigüedad de suscripción Pro) — solo del propio user (RLS). Deploy-safe si falta la columna.
    let proSince = null;
    try {
      const { data } = await supabase.from('subscriptions').select('pro_since').eq('user_id', user.id).maybeSingle();
      proSince = data?.pro_since || null;
    } catch { proSince = null; }

    // Recompensas otorgadas (informativo). Deploy-safe si falta la tabla.
    let otorgados = [];
    try {
      const { data } = await supabase.from('loyalty_rewards').select('tramo_code, otorgado_en, estado').eq('user_id', user.id).eq('estado', 'otorgado');
      otorgados = (data || []).map((r) => ({ tramo_code: r.tramo_code, meses_gratis: tramoDe(r.tramo_code)?.meses_gratis || 0, otorgado_en: r.otorgado_en }));
    } catch { otorgados = []; }

    const meses_pro = proSince ? mesesCompletos(proSince, hoy) : 0; // null-safe → 0
    return NextResponse.json({
      pro_since: proSince,
      meses_pro,
      proximo_tramo: proximoTramo(meses_pro), // sin pro_since → el 1er tramo; todos alcanzados → null
      otorgados,
    });
  } catch (err) {
    console.error('lealtad GET EXCEPCIÓN:', err?.message);
    return NextResponse.json(null); // nunca rompe la HOME
  }
}
