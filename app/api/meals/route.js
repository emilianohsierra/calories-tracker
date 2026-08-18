import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateMeal } from '@/lib/meals/insert';
import { otorgar } from '@/lib/gamification/otorgar';
import { EVENTOS } from '@/lib/gamification/eventos';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const date = new URL(request.url).searchParams.get('date');
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Parámetro date inválido (YYYY-MM-DD)' }, { status: 400 });
  }

  const { data: meals, error } = await supabase
    .from('meals')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .order('time', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error('Error al leer meals:', error);
    return NextResponse.json({ error: 'No se pudieron cargar los platillos' }, { status: 500 });
  }

  // Firmar una URL de corta vida (600s) por cada foto del bucket privado (Opción B).
  const withImage = meals.filter((m) => m.image);
  const urlByImage = {};
  if (withImage.length) {
    const paths = withImage.map((m) => `${user.id}/${m.image}`);
    const { data: signed } = await supabase.storage.from('meal-photos').createSignedUrls(paths, 600);
    signed?.forEach((s, i) => {
      if (s.signedUrl) urlByImage[withImage[i].image] = s.signedUrl;
    });
  }
  const mealsOut = meals.map((m) => ({ ...m, image_url: m.image ? urlByImage[m.image] || null : null }));

  // ingredients ya es un array (columna jsonb): no hace falta JSON.parse.
  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein_g: acc.protein_g + m.protein_g,
      carbs_g: acc.carbs_g + m.carbs_g,
      fat_g: acc.fat_g + m.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  return NextResponse.json({ meals: mealsOut, totals });
}

export async function POST(request) {
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

  const v = validateMeal(body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('meals')
    .insert({ user_id: user.id, ...v.row })
    .select('id')
    .single();

  if (error) {
    console.error('Error al guardar meal:', error);
    return NextResponse.json({ error: 'No se pudo guardar el platillo' }, { status: 500 });
  }

  // Gamificación V1 (best-effort, no bloquea el registro; idempotente por meal_id; gated GAMIFICACION_ON).
  await otorgar(supabase, EVENTOS.MEAL_LOGGED, data.id);

  return NextResponse.json({ id: data.id }, { status: 201 });
}
