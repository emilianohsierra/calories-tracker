import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { toClientListItem } from '@/lib/pantry/shopping';
import { cantidadValida } from '@/lib/pantry/text';

export const runtime = 'nodejs';

// PATCH /api/shopping-list/[id] → { item }. Marca comprado o edita cantidad/texto/unidad.
// Scoped por usuario (.eq('user_id', user.id) además de RLS). Free.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const patch = {};
  if (body?.comprado !== undefined) patch.marcado = !!body.comprado;
  if (body?.texto !== undefined) patch.texto_libre = body.texto ? String(body.texto).trim().slice(0, 120) : null;
  // unidad/cantidad son NOT NULL (default 'pieza'/1): null explícito rompe el update → coercionar.
  if (body?.unidad !== undefined) patch.unidad = body.unidad ? String(body.unidad).slice(0, 20) : 'pieza';
  if (body?.cantidad !== undefined) {
    if (body.cantidad == null) patch.cantidad = 1;
    else {
      const c = cantidadValida(body.cantidad);
      if (c === null) return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
      patch.cantidad = c;
    }
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });

  const { data, error } = await supabase
    .from('shopping_list_items')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single();
  if (error) {
    console.error('shopping-list PATCH:', error.message);
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  }
  return NextResponse.json({ item: toClientListItem(data) });
}

// DELETE /api/shopping-list/[id]
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
  const { error } = await supabase.from('shopping_list_items').delete().eq('id', id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'No se pudo borrar' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
