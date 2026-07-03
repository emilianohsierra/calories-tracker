import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Devuelve el total de calorías por día para los `days` días que terminan en `end`.
export async function GET(request) {
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

  const rows = getDb()
    .prepare(
      `SELECT date, SUM(calories) AS calories FROM meals
       WHERE date BETWEEN ? AND ? GROUP BY date`
    )
    .all(dates[0], dates[dates.length - 1]);
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r.calories]));

  return NextResponse.json({
    days: dates.map((date) => ({ date, calories: byDate[date] || 0 })),
  });
}
