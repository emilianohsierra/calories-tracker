import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEAL_TYPES = ['desayuno', 'comida', 'cena', 'snack'];

export async function GET(request) {
  const date = new URL(request.url).searchParams.get('date');
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Parámetro date inválido (YYYY-MM-DD)' }, { status: 400 });
  }
  const meals = getDb()
    .prepare('SELECT * FROM meals WHERE date = ? ORDER BY time ASC, id ASC')
    .all(date)
    .map((m) => ({ ...m, ingredients: JSON.parse(m.ingredients || '[]') }));

  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein_g: acc.protein_g + m.protein_g,
      carbs_g: acc.carbs_g + m.carbs_g,
      fat_g: acc.fat_g + m.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  return NextResponse.json({ meals, totals });
}

export async function POST(request) {
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

  const result = getDb()
    .prepare(
      `INSERT INTO meals (date, time, title, description, meal_type, calories, protein_g, carbs_g, fat_g, ingredients, confidence, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      date,
      time,
      title,
      String(body.description || '').slice(0, 600),
      MEAL_TYPES.includes(body.meal_type) ? body.meal_type : 'comida',
      calories,
      num(body.protein_g),
      num(body.carbs_g),
      num(body.fat_g),
      JSON.stringify(Array.isArray(body.ingredients) ? body.ingredients.slice(0, 20) : []),
      String(body.confidence || '').slice(0, 10),
      String(body.image || '').replace(/[^a-zA-Z0-9.-]/g, '')
    );

  return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
}
