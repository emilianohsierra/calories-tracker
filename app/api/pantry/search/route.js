import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buscarProducto } from '@/lib/pantry/product-search';
import { normalizeQuery } from '@/lib/pantry/product-brain';

export const runtime = 'nodejs';

// Respuesta SUPERSET: shape nuevo del ProductSearchService ({ match, confianza, producto?,
// candidatos?, source, atribucion?, contribuible? }) + alias legacy ({ found, product, products,
// sugerencias }) para no romper clientes viejos mientras Rams migra ("cambio 1 línea").
function toResponse(r) {
  const base = { match: r.match, confianza: r.confianza ?? null, source: r.source ?? null };
  if (r.match === 'auto') {
    return { ...base, producto: r.producto, atribucion: r.atribucion, found: true, product: r.producto };
  }
  if (r.match === 'disambiguation') {
    const cands = r.candidatos || [];
    return { ...base, candidatos: cands, found: true, products: cands };
  }
  // miss: puede traer un producto PARCIAL (identificación externa, contribuible) o nada.
  return {
    ...base,
    producto: r.producto ?? null,
    candidatos: r.candidatos ?? [],
    contribuible: r.contribuible ?? false,
    motivo: r.motivo,
    found: false,
    product: r.producto ?? null,
    sugerencias: ['etiqueta', 'manual'],
  };
}

// GET /api/pantry/search?code=<barcode>  ·  ?q=<texto>  → resultado del ProductSearchService.
export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

  const url = new URL(request.url);
  const code = (url.searchParams.get('code') || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 32);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  if (!code && !q) return NextResponse.json({ match: 'miss', producto: null, candidatos: [], found: false });

  // Cliente admin (service_role) para persistir SOLO OFF (verificado) y para external_fetch_log
  // (rate-limit/observabilidad, server-only). Si no está disponible → el servicio degrada sin cachear.
  let admin = null;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error('admin no disponible (search):', e?.message);
  }

  // Query estructurada: barcode directo; texto → normalizeQuery del cerebro (extrae marca/presentación).
  const query = code
    ? { barcode: code, userId: user.id }
    : { ...normalizeQuery(q), userId: user.id };

  // Un fallo del servicio NUNCA debe volverse 500 (el cliente caería a un mock que fabrica datos).
  // Ante error → miss accionable (la UI ofrece foto de etiqueta / agregar manual precargado).
  let r;
  try {
    r = await buscarProducto({ supabase, admin }, query);
  } catch (e) {
    console.error('buscarProducto:', e?.message);
    return NextResponse.json({ match: 'miss', producto: null, candidatos: [], found: false, error: 'search_failed' });
  }
  return NextResponse.json(toResponse(r));
}
