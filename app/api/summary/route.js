import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Total de calorías por día para los `days` días que terminan en `end`.
// Opción A (aprobada): se traen las filas del rango y se suman en JS (sin GROUP BY).
export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const end = params.get('end');
  const days = Math.min(Math.max(Number(params.get('days')) || 7, 1), 31);
  if (!end || !DATE_RE.test(end)) {
    return NextResponse.json({ error: 'Parámetro end inválido (YYYY-MM-DD)' }, { status: 400 });
  }

  const endDate = new Date(`${end}T00:00:00`);
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(endDate.getDate() - i);
    dates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
  }

  const { data: rows, error } = await supabase
    .from('meals')
    .select('date, calories')
    .eq('user_id', user.id)
    .gte('date', dates[0])
    .lte('date', dates[dates.length - 1]);

  if (error) {
    console.error('Error al leer resumen:', error);
    return NextResponse.json({ error: 'No se pudo cargar el resumen' }, { status: 500 });
  }

  const byDate = {};
  for (const r of rows) {
    byDate[r.date] = (byDate[r.date] || 0) + r.calories;
  }

  return NextResponse.json({
    days: dates.map((date) => ({ date, calories: byDate[date] || 0 })),
  });
}
