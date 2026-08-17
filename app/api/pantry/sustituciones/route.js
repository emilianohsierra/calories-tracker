import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readItemsParaMatching, getProductoCalidad, readAlternativasCatalogo } from '@/lib/pantry/db';
import { sustituir } from '@/lib/pantry/sustituciones';

// Pantry · Sustituciones para la FICHA del producto (Fase 7, #3). GET → alternativas MEJORES y SEGURAS
// (menos sellos NOM-051 / mejor nutri-score / disponibles en la despensa), reusando lib/pantry/sustituciones.
// SEGURIDAD (crítico): sustituir() pasa CADA candidato por clasificarItem (safety.js) → SOLO 'SEGURO' →
// NUNCA una alternativa con un alérgeno/intolerancia/no-consume del usuario. [] honesto si no hay. NO inventa.
// Restricciones SIEMPRE del perfil server-side (no del cliente). Deploy-safe: sin tablas → objetivo null / [].
export const runtime = 'nodejs';

const activos = (sellos) => (Array.isArray(sellos?.activos) ? sellos.activos : []);

export async function GET(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const productId = (searchParams.get('product_id') || '').trim();
    const nombre = (searchParams.get('nombre') || '').trim();
    if (!productId && !nombre) return NextResponse.json({ error: 'falta_producto' }, { status: 400 });

    // Restricciones del usuario (server-side): alergias + intolerancias + no_consume. Perfil select('*')
    // como el coach (evita romper si alguna columna no existe).
    const { data: perfil } = await supabase.from('nutrition_profiles').select('*').eq('user_id', user.id).maybeSingle();
    const restricciones = [
      ...(perfil?.allergies || []),
      ...(perfil?.intolerances || []),
      ...(Array.isArray(perfil?.no_consume) ? perfil.no_consume : []),
    ].filter(Boolean);

    const despensa = await readItemsParaMatching(supabase, user.id, 200);

    // TARGET: en la despensa (por product_id o nombre) o del catálogo (por product_id). Sin target
    // resoluble → no hay contra qué comparar "mejor" → honesto (objetivo null, [] ).
    let target = null;
    if (productId) target = despensa.find((i) => i.product_id === productId) || null;
    if (!target && nombre) target = despensa.find((i) => String(i.nombre || '').toLowerCase().includes(nombre.toLowerCase())) || null;
    if (!target && productId) target = await getProductoCalidad(supabase, productId);
    if (!target) return NextResponse.json({ objetivo: null, sustituciones: [], nota: 'No pude identificar el producto para comparar.' });

    // CANDIDATOS: despensa (disponible:true) + alternativas curadas del catálogo (best-effort, disponible:false).
    const catalogo = productId ? await readAlternativasCatalogo(supabase, productId, 20) : [];
    const candidatos = [...despensa.map((i) => ({ ...i, disponible: true })), ...catalogo];

    // sustituir() filtra CADA candidato por clasificarItem (SOLO SEGURO) + solo si mejora de verdad; ranking
    // disponibles → menos sellos → mejor nutri-score; nunca a sí mismo.
    const sustituciones = sustituir({ target, candidatos, restricciones, opts: { max: 5 } });

    return NextResponse.json({
      objetivo: { product_id: target.product_id || null, nombre: target.nombre || null, nutri_score: target.nutri_score || null, sellos: activos(target.sellos) },
      sustituciones,
      nota: sustituciones.length ? null : 'Por ahora no encontré una alternativa mejor y segura para este producto.',
    });
  } catch (err) {
    console.error('pantry/sustituciones GET EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo calcular' }, { status: 500 });
  }
}
