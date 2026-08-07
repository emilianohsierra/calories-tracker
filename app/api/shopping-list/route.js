import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDefaultList, readListItems, toClientListItem, ORIGENES } from '@/lib/pantry/shopping';
import { cantidadValida } from '@/lib/pantry/text';

export const runtime = 'nodejs';

// Lista de compras — CRUD SIEMPRE Free e ilimitado (no es un tier; es herramienta). Scoped por
// usuario: RLS (user_id = auth.uid()) + filtro explícito user_id (defensa en profundidad).
const MAX_ITEMS = 200;

// GET /api/shopping-list → { items: [...] }
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
  const items = await readListItems(supabase, user.id);
  return NextResponse.json({ items });
}

// POST /api/shopping-list → { item }. Agrega un producto o texto libre.
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const product_id = body?.product_id ? String(body.product_id) : null;
  const texto = body?.texto ? String(body.texto).trim().slice(0, 120) : null;
  if (!product_id && !texto) {
    return NextResponse.json({ error: 'Agrega un producto o un texto' }, { status: 400 });
  }
  const cantidad = body?.cantidad == null ? null : cantidadValida(body.cantidad);
  if (body?.cantidad != null && cantidad === null) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
  }
  const origen = ORIGENES.includes(body?.origen) ? body.origen : 'manual';

  const lista = await getDefaultList(supabase, user.id, { create: true });
  if (!lista) return NextResponse.json({ error: 'No se pudo crear tu lista' }, { status: 500 });

  const { count } = await supabase.from('shopping_list_items').select('id', { count: 'exact', head: true }).eq('list_id', lista.id);
  if ((count ?? 0) >= MAX_ITEMS) {
    return NextResponse.json({ error: `Tu lista llegó al máximo de ${MAX_ITEMS} artículos.` }, { status: 409 });
  }

  const row = {
    list_id: lista.id,
    user_id: user.id,
    product_id,
    texto_libre: texto,
    cantidad,
    unidad: body?.unidad ? String(body.unidad).slice(0, 20) : null,
    marcado: false,
    origen,
  };
  const { data, error } = await supabase.from('shopping_list_items').insert(row).select('*').single();
  if (error) {
    console.error('shopping-list POST:', error.message);
    return NextResponse.json({ error: 'No se pudo agregar a la lista' }, { status: 500 });
  }
  return NextResponse.json({ item: toClientListItem(data) }, { status: 201 });
}
