import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { toClientItem } from '@/lib/pantry/db';
import { cantidadValida } from '@/lib/pantry/text';

export const runtime = 'nodejs';

const CONFIANZA = ['verified', 'user', 'ai'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// PATCH /api/pantry/[id] → { item } | { removed:true }.
// - { consumir:N } decrementa la cantidad; si llega a 0, borra el ítem.
// - o campos directos (nombre/marca/categoria/cantidad/unidad/caduca_el/nutricion/confianza/imagen).
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

  // Consumir (decremento). RLS acota a lo propio; además filtramos user_id.
  if (body?.consumir !== undefined) {
    const dec = cantidadValida(body.consumir);
    if (dec === null || dec <= 0) return NextResponse.json({ error: 'consumir inválido' }, { status: 400 });
    const { data: cur } = await supabase.from('pantry_items').select('cantidad').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (!cur) return NextResponse.json({ error: 'No existe' }, { status: 404 });
    const nueva = Math.max(0, (Number(cur.cantidad) || 0) - dec);
    if (nueva <= 0) {
      const { error } = await supabase.from('pantry_items').delete().eq('id', id).eq('user_id', user.id);
      if (error) return NextResponse.json({ error: 'No se pudo consumir' }, { status: 500 });
      return NextResponse.json({ ok: true, removed: true });
    }
    const { data, error } = await supabase
      .from('pantry_items')
      .update({ cantidad: nueva, updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', user.id)
      .select('*').single();
    if (error) return NextResponse.json({ error: 'No se pudo consumir' }, { status: 500 });
    return NextResponse.json({ item: toClientItem(data) });
  }

  const patch = { updated_at: new Date().toISOString() };
  if (body?.nombre !== undefined) patch.nombre = String(body.nombre).trim().slice(0, 120);
  if (body?.marca !== undefined) patch.marca = body.marca ? String(body.marca).slice(0, 80) : null;
  if (body?.categoria !== undefined) patch.categoria = body.categoria ? String(body.categoria).slice(0, 40) : null;
  if (body?.cantidad !== undefined) {
    const c = cantidadValida(body.cantidad);
    if (c === null) return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
    patch.cantidad = c;
  }
  if (body?.unidad !== undefined) patch.unidad = String(body.unidad).slice(0, 20);
  if (body?.caduca_el !== undefined) patch.caduca_el = DATE_RE.test(String(body.caduca_el || '')) ? body.caduca_el : null;
  if (body?.nutricion !== undefined) patch.nutricion = body.nutricion && typeof body.nutricion === 'object' ? body.nutricion : null;
  if (body?.allergens !== undefined) patch.allergens = Array.isArray(body.allergens) ? body.allergens.slice(0, 20).map((a) => String(a).slice(0, 40)) : [];
  if (body?.confianza !== undefined && CONFIANZA.includes(body.confianza)) patch.confianza = body.confianza;
  if (body?.imagen !== undefined) patch.imagen = body.imagen ? String(body.imagen).slice(0, 300) : null;

  const { data, error } = await supabase
    .from('pantry_items')
    .update(patch)
    .eq('id', id).eq('user_id', user.id)
    .select('*').single();
  if (error) {
    console.error('pantry PATCH:', error.message);
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  }
  return NextResponse.json({ item: toClientItem(data) });
}

// DELETE /api/pantry/[id]
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
  const { error } = await supabase.from('pantry_items').delete().eq('id', id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'No se pudo borrar' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
