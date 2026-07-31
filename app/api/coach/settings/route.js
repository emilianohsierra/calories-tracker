import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Ajustes del coach. R2: cambiar personalidad/tono (GRATIS — no se capea el tono).
const TONES = ['amigable', 'entrenador', 'analitico', 'tranquilo'];

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const tone = String(body?.tone || '');
  if (!TONES.includes(tone)) {
    return NextResponse.json({ error: 'Tono no válido' }, { status: 400 });
  }

  // Actualiza solo el tono en el perfil (RLS propio). No recalcula el plan.
  const { error } = await supabase
    .from('nutrition_profiles')
    .update({ tone, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (error) {
    console.error('Error al guardar tono:', error);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }
  return NextResponse.json({ tone });
}
