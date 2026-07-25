import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEAL_TYPES = ['desayuno', 'comida', 'cena', 'snack'];

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

  const date = String(body.date || '');
  const time = String(body.time || '');
  const title = String(body.title || '').trim().slice(0, 120);
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Hora inválida' }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 });
  }
  const calories = Math.round(Number(body.calories));
  if (!Number.isFinite(calories) || calories < 0 || calories > 10000) {
    return NextResponse.json({ error: 'Calorías inválidas' }, { status: 400 });
  }
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
  };

  const { data, error } = await supabase
    .from('meals')
    .insert({
      user_id: user.id,
      date,
      time,
      title,
      description: String(body.description || '').slice(0, 600),
      meal_type: MEAL_TYPES.includes(body.meal_type) ? body.meal_type : 'comida',
      calories,
      protein_g: num(body.protein_g),
      carbs_g: num(body.carbs_g),
      fat_g: num(body.fat_g),
      ingredients: Array.isArray(body.ingredients) ? body.ingredients.slice(0, 20) : [],
      confidence: String(body.confidence || '').slice(0, 10),
      image: String(body.image || '').replace(/[^a-zA-Z0-9.-]/g, ''),
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error al guardar meal:', error);
    return NextResponse.json({ error: 'No se pudo guardar el platillo' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
