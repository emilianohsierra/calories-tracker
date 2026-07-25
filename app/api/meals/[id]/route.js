import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const BUCKET = 'meal-photos';

export async function DELETE(request, { params }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { id } = await params;
  const mealId = Number(id);
  if (!Number.isInteger(mealId) || mealId <= 0) {
    return NextResponse.json({ error: 'Id inválido' }, { status: 400 });
  }

  // Se filtra por user_id además de la RLS: solo se borra un platillo propio.
  const { data: meal } = await supabase
    .from('meals')
    .select('image')
    .eq('id', mealId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!meal) {
    return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 });
  }

  const { error } = await supabase.from('meals').delete().eq('id', mealId).eq('user_id', user.id);
  if (error) {
    console.error('Error al borrar meal:', error);
    return NextResponse.json({ error: 'No se pudo eliminar el platillo' }, { status: 500 });
  }

  // Borrar la foto del bucket (best-effort; la RLS solo permite la carpeta propia).
  if (meal.image) {
    await supabase.storage.from(BUCKET).remove([`${user.id}/${meal.image}`]).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
