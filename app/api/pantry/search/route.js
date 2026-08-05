import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { norm } from '@/lib/pantry/text';
import { fetchOFF, cacheOFF } from '@/lib/pantry/off';

export const runtime = 'nodejs';

// Prioridad de confianza para elegir la mejor fila nutricional del producto.
const NIVEL_RANK = { verificado: 3, usuario: 2, estimado_ia: 1 };
const NIVEL_TO_CONFIANZA = { verificado: 'verified', usuario: 'user', estimado_ia: 'ai' };
const NUT_COLS = 'base_amount, base_unit, calories, protein_g, carbs_g, fat_g, fiber_g, allergens, nivel';
const PROD_SELECT = `id, name, off_id, image_url, brands(name), categories(name), product_nutrition(${NUT_COLS})`;

// Mejor fila nutricional (por nivel de confianza).
function mejorRow(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.slice().sort((a, b) => (NIVEL_RANK[b.nivel] || 0) - (NIVEL_RANK[a.nivel] || 0))[0];
}

// Producto del catálogo → ítem que el cliente puede AGREGAR a la despensa.
function toCatalogResult(p) {
  const best = mejorRow(p.product_nutrition);
  const esPorcion = best?.base_unit === 'porcion';
  const nut = best
    ? {
        base: esPorcion ? 'por_porcion' : 'por_100g',
        ...(esPorcion ? { porcion_g: Number(best.base_amount) } : {}),
        kcal: best.calories, prot: best.protein_g, carb: best.carbs_g, gras: best.fat_g, fibra: best.fiber_g,
        procedencia: best.nivel || 'estimado_ia',
      }
    : null;
  return {
    product_id: p.id,
    nombre: p.name,
    marca: p.brands?.name || '',
    categoria: p.categories?.name || '',
    nutricion: nut,
    // Etiquetas ESTRUCTURADAS: sólo confiables si el nivel es 'verificado' (OFF). El cliente
    // las guarda en el pantry_item; Karpathy las usa cuando confianza='verified'.
    allergens: Array.isArray(best?.allergens) ? best.allergens : [],
    confianza: nut ? NIVEL_TO_CONFIANZA[nut.procedencia] || 'ai' : 'user',
    imagen: p.image_url || '',
  };
}

// GET /api/pantry/search?q=  → { products: [...] }   ·   ?code=  → { product } | null
export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

  const url = new URL(request.url);
  const code = (url.searchParams.get('code') || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 32);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);

  // Búsqueda por código de barras. Local primero; miss → Open Food Facts (lazy, cache).
  if (code) {
    const { data } = await supabase
      .from('barcodes')
      .select(`code, products(${PROD_SELECT})`)
      .eq('code', code)
      .maybeSingle();
    if (data?.products) {
      return NextResponse.json({ found: true, product: toCatalogResult(data.products), source: 'catalogo' });
    }
    // OFF fallback (no dependencia dura): consulta, cachea al catálogo, atribuye.
    const off = await fetchOFF(code);
    if (!off) {
      // MISS (cobertura OFF floja en MX): NO callejón sin salida. El front ofrece alternativas.
      return NextResponse.json({ found: false, product: null, source: null, sugerencias: ['texto', 'etiqueta'] });
    }
    // Cache del 'verificado' SOLO con service_role (server-only), tras el fetch REAL a OFF —
    // nunca escribible por el usuario (Slowking). Si falta el admin, se devuelve sin cachear.
    let productId = null;
    try {
      const admin = createAdminClient();
      productId = await cacheOFF(admin, user.id, code, off);
    } catch (e) {
      console.error('cacheOFF (admin) no disponible:', e?.message);
    }
    const product = {
      product_id: productId || null,
      nombre: off.nombre,
      marca: off.marca || '',
      categoria: off.categoria || '',
      nutricion: off.nutricion || null,
      allergens: Array.isArray(off.allergens) ? off.allergens : [],   // etiquetas estructuradas OFF
      confianza: 'verified',
      imagen: off.image_url || '',
    };
    return NextResponse.json({ found: true, product, source: 'open_food_facts', atribucion: 'Datos de Open Food Facts' });
  }

  // Búsqueda por nombre/marca (pg_trgm sobre `norm`).
  const n = norm(q);
  if (n.length < 2) return NextResponse.json({ products: [] });
  const { data, error } = await supabase
    .from('products')
    .select(PROD_SELECT)
    .ilike('norm', `%${n}%`)
    .limit(20);
  if (error) {
    console.error('pantry search:', error.message);
    return NextResponse.json({ products: [] });
  }
  return NextResponse.json({ products: (data || []).map(toCatalogResult) });
}
