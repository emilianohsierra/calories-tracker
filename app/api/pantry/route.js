import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDefaultPantry, readItems, toClientItem, firmarImagen } from '@/lib/pantry/db';
import { cantidadValida } from '@/lib/pantry/text';
import { otorgar } from '@/lib/gamification/otorgar';
import { EVENTOS } from '@/lib/gamification/eventos';

export const runtime = 'nodejs';

// Tope técnico SUAVE anti-abuso (NO monetización; la despensa es Free sin muro). Mensaje
// neutro, nunca "hazte Pro". El cap de reco (¿qué puedo comer?) va aparte (despensa_reco).
const MAX_ITEMS = 100;
const CONFIANZA = ['verified', 'user', 'ai'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/pantry → { items: [...] } (shape del cliente del equipo).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
  const items = await readItems(supabase, user.id);
  return NextResponse.json({ items });
}

// POST /api/pantry (item del cliente) → { item } (con el id real del backend).
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

  const nombre = String(body?.nombre || '').trim().slice(0, 120);
  if (!nombre) return NextResponse.json({ error: 'Falta el nombre del producto' }, { status: 400 });
  const cantidad = cantidadValida(body?.cantidad ?? 1);
  if (cantidad === null) return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });

  const row = {
    user_id: user.id,
    product_id: body?.product_id ? String(body.product_id) : null,
    nombre,
    marca: body?.marca ? String(body.marca).slice(0, 80) : null,
    categoria: body?.categoria ? String(body.categoria).slice(0, 40) : null,
    cantidad,
    unidad: String(body?.unidad || 'pieza').slice(0, 20),
    caduca_el: DATE_RE.test(String(body?.caduca_el || '')) ? body.caduca_el : null,
    nutricion: body?.nutricion && typeof body.nutricion === 'object' ? body.nutricion : null,
    // Etiquetas de alérgeno (verificado=OFF; manual=[]). NO se inventan.
    allergens: Array.isArray(body?.allergens) ? body.allergens.slice(0, 20).map((a) => String(a).slice(0, 40)) : [],
    confianza: CONFIANZA.includes(body?.confianza) ? body.confianza : 'user',
    imagen: body?.imagen ? String(body.imagen).slice(0, 300) : null,
  };

  const pantry = await getDefaultPantry(supabase, user.id, { create: true });
  if (!pantry) return NextResponse.json({ error: 'No se pudo crear tu despensa' }, { status: 500 });

  const { count } = await supabase.from('pantry_items').select('id', { count: 'exact', head: true }).eq('pantry_id', pantry.id);
  if ((count ?? 0) >= MAX_ITEMS) {
    return NextResponse.json({ error: `Tu despensa llegó al máximo de ${MAX_ITEMS} artículos. Borra alguno para agregar más.` }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('pantry_items')
    .insert({ ...row, pantry_id: pantry.id })
    .select('*')
    .single();
  if (error) {
    console.error('pantry POST:', { code: error.code, details: error.details, message: error.message }); // Item 10: code/details, no solo message
    return NextResponse.json({ error: 'No se pudo agregar a la despensa' }, { status: 500 });
  }
  // Gamificación V1 (best-effort, no bloquea; idempotente por item_id; gated GAMIFICACION_ON).
  await otorgar(supabase, EVENTOS.PANTRY_ITEM_ADDED, data.id);

  const item = toClientItem(data);
  item.image_url = await firmarImagen(supabase, data.imagen); // path de storage → URL firmada
  return NextResponse.json({ item }, { status: 201 });
}
