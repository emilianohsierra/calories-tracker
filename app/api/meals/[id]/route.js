import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDb, getUploadsDir } from '@/lib/db';

export async function DELETE(request, { params }) {
  const { id } = await params;
  const mealId = Number(id);
  if (!Number.isInteger(mealId) || mealId <= 0) {
    return NextResponse.json({ error: 'Id inválido' }, { status: 400 });
  }
  const db = getDb();
  const meal = db.prepare('SELECT image FROM meals WHERE id = ?').get(mealId);
  if (!meal) {
    return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 });
  }
  db.prepare('DELETE FROM meals WHERE id = ?').run(mealId);
  if (meal.image) {
    const safe = path.basename(meal.image);
    await fs.unlink(path.join(getUploadsDir(), safe)).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
