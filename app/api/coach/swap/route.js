import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readItemsParaMatching } from '@/lib/pantry/db';
import { sustituir } from '@/lib/pantry/sustituciones';
import { debeOfrecerLeccion, trasOferta } from '@/lib/coach/educacion';
import { esDatoDeSalud } from '@/lib/coach/actions';

// Coach · SWAP POR OBJETIVO (Recomendaciones v2 · B, proactivo). GET → una oferta de swap {de,a,razon,
// a_product_id}|null: el peor ítem de la despensa (por sellos/nutri) + la mejor alternativa SEGURA y
// mejor-POR-OBJETIVO (Karpathy §B). Gated por back-off anti-saturación (coach_params.swap_ofertas_ignoradas)
// + flag SWAP_PROACTIVO_ON. Determinista, $0. POST {acepto} → persiste el back-off. Alérgenos filtrados
// SIEMPRE (sustituir → clasificarItem SOLO 'SEGURO'); objetivo del PERFIL server-side; nunca demoniza.
export const runtime = 'nodejs';
const SWAP_ON = process.env.SWAP_PROACTIVO_ON === '1';

const NUTRI = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const nutriVal = (s) => NUTRI[String(s || '').toLowerCase()] || 0;
const sellosLen = (i) => (Array.isArray(i?.sellos?.activos) ? i.sellos.activos.length : 0);
// Peor ítem a mejorar: más sellos de EXCESO; a igualdad peor nutri. Requiere señal (sellos o nutri d/e).
function peorItem(items) {
  const orden = [...items].sort((a, b) => (sellosLen(b) - sellosLen(a)) || (nutriVal(b.nutri_score) - nutriVal(a.nutri_score)));
  const top = orden[0];
  if (!top) return null;
  return (sellosLen(top) > 0 || nutriVal(top.nutri_score) >= 4) ? top : null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    if (!SWAP_ON) return NextResponse.json({ swap: null }); // flag off → no se ofrece (deploy-safe)

    const { data: perfil } = await supabase.from('nutrition_profiles').select('*').eq('user_id', user.id).maybeSingle();
    const ignoradas = perfil?.coach_params?.swap_ofertas_ignoradas || 0;
    if (!debeOfrecerLeccion(ignoradas)) return NextResponse.json({ swap: null }); // back-off: 2 ignoradas → para

    const restricciones = [
      ...(perfil?.allergies || []), ...(perfil?.intolerances || []),
      ...(Array.isArray(perfil?.no_consume) ? perfil.no_consume : []),
    ].filter(Boolean);
    const objetivo = perfil?.coach || 'bienestar';

    const items = await readItemsParaMatching(supabase, user.id, 200);
    const target = peorItem(items);
    if (!target) return NextResponse.json({ swap: null }); // nada que valga la pena cambiar

    const candidatos = items.map((i) => ({ ...i, disponible: true }));
    const alts = sustituir({ target, candidatos, restricciones, objetivo, opts: { max: 1 } });
    if (!alts.length) return NextResponse.json({ swap: null }); // sin alternativa segura+mejor → honesto

    const a = alts[0];
    // Cinturón belt-and-suspenders: esDatoDeSalud sobre el texto ensamblado (contenido es nombres de
    // producto + razón grounded → no debería tocar salud; si tripea, no se ofrece).
    if (esDatoDeSalud(`${target.nombre} ${a.nombre} ${a.razon}`)) return NextResponse.json({ swap: null });

    return NextResponse.json({ swap: { de: target.nombre, a: a.nombre, razon: a.razon, a_product_id: a.product_id || null } });
  } catch (err) {
    console.error('coach/swap GET EXCEPCIÓN:', err?.message);
    return NextResponse.json({ swap: null }); // deploy-safe: nunca rompe la UI (degrada a sin-tarjeta)
  }
}

// POST { acepto } → back-off: aceptó → resetea; ignoró → +1 (persiste coach_params.swap_ofertas_ignoradas).
export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { data: perfil } = await supabase.from('nutrition_profiles').select('coach_params').eq('user_id', user.id).maybeSingle();
    const cp = (perfil && typeof perfil.coach_params === 'object' && perfil.coach_params) || {};
    const nuevas = trasOferta(cp.swap_ofertas_ignoradas || 0, !!body.acepto);
    const { error } = await supabase.from('nutrition_profiles').update({ coach_params: { ...cp, swap_ofertas_ignoradas: nuevas } }).eq('user_id', user.id);
    if (error) console.error('swap oferta back-off:', { code: error.code });
    return NextResponse.json({ ok: true, ofrecer: debeOfrecerLeccion(nuevas) });
  } catch (err) {
    console.error('coach/swap POST EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo registrar' }, { status: 500 });
  }
}
