import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { currentPeriod, nextResetLabel } from '@/lib/usage';

// Devuelve la cuota de IA del usuario para pintar "análisis restantes" en la UI.
// El límite mostrado sale de FREE_ANALYSIS_LIMIT (env, solo display); la aplicación
// REAL del límite vive en app_config server-side (VB-CONFIG).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
  if (profile?.plan === 'premium') {
    return NextResponse.json({ plan: 'premium', remaining: null, limit: null });
  }

  const period = currentPeriod();
  const { data: row } = await supabase
    .from('usage_counters')
    .select('count')
    .eq('user_id', user.id)
    .eq('period', period)
    .maybeSingle();

  const limit = Number(process.env.FREE_ANALYSIS_LIMIT) || 10;
  const used = row?.count ?? 0;
  const remaining = Math.max(limit - used, 0);

  return NextResponse.json({ plan: 'free', remaining, limit, resets_on: nextResetLabel() });
}
