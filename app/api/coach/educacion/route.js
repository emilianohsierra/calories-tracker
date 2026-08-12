import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { localDateTime } from '@/lib/coach/context';
import { leccionDe, patchQuiz, debeOfrecerLeccion } from '@/lib/coach/educacion';
import { CONCEPTOS_MVP } from '@/lib/coach/curriculum';

// Coach · Educación — estado + micro-lección + quiz (MVP). Micro-lecciones = degustación Free
// (≤ DEGUSTACION_FREE), ilimitadas Pro. Quiz guarda acierto/fallo (NO se domina por 1 acierto → el
// SRS de fase posterior decide 'dominado'). Deploy-safe: sin education_progress → estado vacío.
export const runtime = 'nodejs';
const DEGUSTACION_FREE = 3; // Drucker: 2-3 micro-lecciones de degustación para Free.

async function estado(supabase, userId) {
  const { data, error } = await supabase.from('education_progress').select('concepto, aciertos, errores').eq('user_id', userId);
  if (error && error.code === '42P01') return { conceptos: [], vistos: 0 }; // tabla ausente → vacío
  const conceptos = data || [];
  return { conceptos, vistos: conceptos.length };
}

// GET → { nivel, vistos, ofrecer } para que Rams pinte el contador y decida si ofrecer lección.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    const { data: perfil } = await supabase.from('nutrition_profiles').select('nutrition_knowledge_level, coach_params').eq('user_id', user.id).maybeSingle();
    const { vistos } = await estado(supabase, user.id);
    const ignoradas = perfil?.coach_params?.edu_ofertas_ignoradas || 0;
    return NextResponse.json({
      nivel: perfil?.nutrition_knowledge_level || null,
      vistos,
      ofrecer: debeOfrecerLeccion(ignoradas), // back-off: si ignoró 2, deja de ofrecer
    });
  } catch (err) {
    console.error('educacion GET EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
  }
}

// POST { accion:'leccion', concepto } → micro-lección anclada a datos reales (marca 'visto').
// POST { accion:'quiz', concepto, correcto } → registra el resultado.
export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const concepto = String(body.concepto || '');
    if (!CONCEPTOS_MVP.includes(concepto)) return NextResponse.json({ error: 'no_concepto' }, { status: 400 });

    if (body.accion === 'quiz') {
      const { data: prev } = await supabase.from('education_progress').select('aciertos, errores').eq('user_id', user.id).eq('concepto', concepto).maybeSingle();
      const patch = patchQuiz(prev, !!body.correcto);
      const { error } = await supabase.from('education_progress').upsert(
        { user_id: user.id, concepto, ...patch, ultimo_visto: localDateTime().date, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,concepto' },
      );
      if (error) { console.error('quiz upsert:', { code: error.code, details: error.details }); return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 }); }
      return NextResponse.json({ ok: true });
    }

    // accion 'leccion' (default): gating degustación + datos reales.
    const { data: plan } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle();
    const isPro = plan?.plan === 'premium';
    const { vistos } = await estado(supabase, user.id);
    if (!isPro && vistos >= DEGUSTACION_FREE) {
      return NextResponse.json({ pro: true, mensaje: 'Ya viste tus micro-lecciones gratis. Con Pro son ilimitadas.' });
    }

    const { date } = localDateTime();
    const [{ data: targets }, { data: meals }] = await Promise.all([
      supabase.from('nutrition_targets').select('kcal_target, protein_g').eq('user_id', user.id).maybeSingle(),
      supabase.from('meals').select('protein_g').eq('user_id', user.id).eq('date', date),
    ]);
    const protConsumida = (meals || []).reduce((a, m) => a + (m.protein_g || 0), 0);
    const lec = leccionDe(concepto);
    const cuerpo = lec.cuerpo({ protConsumida, protObjetivo: targets?.protein_g, kcalObjetivo: targets?.kcal_target });

    // Marca 'visto' (idempotente por concepto).
    await supabase.from('education_progress').upsert(
      { user_id: user.id, concepto, estado: 'visto', ultimo_visto: date, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,concepto', ignoreDuplicates: false },
    );
    return NextResponse.json({ titulo: lec.titulo, cuerpo, quiz: lec.quiz, concepto });
  } catch (err) {
    console.error('educacion POST EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
  }
}
