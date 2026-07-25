import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const GOAL_KEY = 'calorie_goal';
const DEFAULT_GOAL = 2000;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', user.id)
    .eq('key', GOAL_KEY)
    .maybeSingle();

  const goal = data ? Number(data.value) : DEFAULT_GOAL;
  return NextResponse.json({ calorie_goal: Number.isFinite(goal) ? goal : DEFAULT_GOAL });
}

export async function PUT(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const goal = Math.round(Number(body.calorie_goal));
  if (!Number.isFinite(goal) || goal < 500 || goal > 10000) {
    return NextResponse.json({ error: 'La meta debe estar entre 500 y 10,000 kcal' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert(
      { user_id: user.id, key: GOAL_KEY, value: String(goal) },
      { onConflict: 'user_id,key' }
    );
  if (error) {
    console.error('Error al guardar setting:', error);
    return NextResponse.json({ error: 'No se pudo guardar la meta' }, { status: 500 });
  }

  return NextResponse.json({ calorie_goal: goal });
}
