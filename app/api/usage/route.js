import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { currentPeriod, nextResetLabel } from '@/lib/usage';

// Devuelve la cuota de IA del usuario para pintar el badge y el paywall.
// El límite mostrado (free) sale de FREE_ANALYSIS_LIMIT (env, solo display); la
// aplicación REAL vive en app_config server-side. Pro se comunica como ilimitado.
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
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, current_period_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .maybeSingle();
    return NextResponse.json({
      plan: 'pro',
      remaining: null,
      limit: null,
      subscription: sub || null,
    });
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

  return NextResponse.json({ plan: 'free', remaining, limit, used, resets_on: nextResetLabel() });
}
