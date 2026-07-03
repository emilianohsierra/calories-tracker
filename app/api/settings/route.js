import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';

export async function GET() {
  return NextResponse.json({ calorie_goal: Number(getSetting('calorie_goal', 2000)) });
}

export async function PUT(request) {
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
  setSetting('calorie_goal', goal);
  return NextResponse.json({ calorie_goal: goal });
}
