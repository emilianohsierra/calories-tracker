import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { crearProductoUsuario } from '@/lib/pantry/catalog';

export const runtime = 'nodejs';

// POST /api/pantry/products — contribuye un producto PROPIO al catálogo, MARCADO is_user_created
// (NO verificado). Crea products(is_user_created=true) + product_nutrition(nivel 'usuario', append)
// + product_images opcional. Reusa por dedup_key (no duplica). NADA de invención: la nutrición la
// aporta el usuario/etiqueta; ausente = null. Distinto de POST /api/pantry (ese guarda el ITEM en tu
// despensa; este alimenta el CATÁLOGO compartido).
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
  if (!String(body?.nombre || '').trim()) {
    return NextResponse.json({ error: 'Falta el nombre del producto' }, { status: 400 });
  }

  const productId = await crearProductoUsuario(supabase, user.id, body);
  if (!productId) return NextResponse.json({ error: 'No se pudo guardar el producto' }, { status: 500 });
  return NextResponse.json({ product_id: productId, is_user_created: true }, { status: 201 });
}
