import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Contexto ligero para el SALUDO contextual del chat (determinista, 0 IA).
// Reusa nutrition_profiles/targets (Ola 1) + meals de hoy. No llama a la IA.
function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

  const [{ data: profile }, { data: targets }, { data: meals }] = await Promise.all([
    supabase.from('nutrition_profiles').select('coach, tone').eq('user_id', user.id).maybeSingle(),
    supabase.from('nutrition_targets').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('meals').select('calories, protein_g').eq('user_id', user.id).eq('date', today()),
  ]);

  const consumed = (meals || []).reduce(
    (a, m) => ({ kcal: a.kcal + (m.calories || 0), prot: a.prot + (m.protein_g || 0) }),
    { kcal: 0, prot: 0 }
  );
  const pending = targets
    ? {
        kcal: Math.max(Math.round(targets.kcal_target - consumed.kcal), 0),
        prot: Math.max(Math.round(targets.protein_g - consumed.prot), 0),
      }
    : null;

  return NextResponse.json({
    coach: profile?.coach || null,
    tone: profile?.tone || 'amigable',
    pending,
    has_profile: !!profile,
  });
}
