import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { localDateTime } from '@/lib/coach/context';
import { leccionDe, patchQuiz, debeOfrecerLeccion, trasOferta } from '@/lib/coach/educacion';
import { CONCEPTOS_MVP, CONCEPTOS_EXPLICABLES } from '@/lib/coach/curriculum';
import { esDatoDeSalud } from '@/lib/coach/actions';
import { readItemsParaMatching } from '@/lib/pantry/db';
import { filtrarDespensaSegura } from '@/lib/pantry/safety';
import { programarRepaso, elegirForma, construirItemRepaso, seleccionarDue, TEMAS_REPASO, CATALOGO, SRS, sumarDias } from '@/lib/coach/repaso';

// Coach · Educación — estado + micro-lección + quiz + REPASO ESPACIADO (SM-2). Micro-lecciones =
// degustación Free (≤ DEGUSTACION_FREE); el REPASO es Free ILIMITADO y $0 (determinista, sin metering).
// Deploy-safe: sin education_progress → estado vacío; sin las columnas SRS / REPASO_ON off → repaso:null.
export const runtime = 'nodejs';
const DEGUSTACION_FREE = 3; // Drucker: 2-3 micro-lecciones de degustación para Free.
const REPASO_ON = process.env.REPASO_ON === '1'; // flag staged: encender el repaso por etapas.

// Temas del repaso que además existen en el curriculum VIVO (lecciones o explicaciones — 'macros' vive en
// EXPLICACIONES). Un concepto fuera del curriculum → fila huérfana IGNORADA (deploy-safe).
const CURRICULUM = new Set([...CONCEPTOS_MVP, ...CONCEPTOS_EXPLICABLES]);
const TEMAS_VALIDOS = TEMAS_REPASO.filter((t) => CURRICULUM.has(t));
const diaDelAno = (fecha) => { const d = new Date(`${fecha}T00:00:00Z`); return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000); };

// Nombre de UN alimento de la despensa SEGURO para nombrar (pasa el filtro de alérgenos, política 'excluir'
// = no nombra lo incierto — igual que el Consejo). null si no hay ninguno seguro → se omite el contexto.
async function ingredienteSeguro(supabase, userId) {
  try {
    const { data: perfil } = await supabase.from('nutrition_profiles').select('allergies, intolerances').eq('user_id', userId).maybeSingle();
    const restricciones = [...(perfil?.allergies || []), ...(perfil?.intolerances || [])];
    const items = await readItemsParaMatching(supabase, userId, 40);
    const { seguros } = filtrarDespensaSegura(items || [], restricciones, { politicaNoVerificado: 'excluir' });
    return (seguros || []).map((x) => x.nombre).filter(Boolean)[0] || null;
  } catch { return null; }
}

async function estado(supabase, userId) {
  const { data, error } = await supabase.from('education_progress').select('concepto, aciertos, errores').eq('user_id', userId);
  if (error && error.code === '42P01') return { conceptos: [], vistos: 0 }; // tabla ausente → vacío
  const conceptos = data || [];
  return { conceptos, vistos: conceptos.length };
}

// Lee las filas con columnas SRS. Deploy-safe: tabla ausente (42P01) o columnas SRS ausentes (42703) → null
// (señal de "SRS no disponible" → repaso:null). Nunca rompe /educacion.
async function repasoRows(supabase, userId) {
  const { data, error } = await supabase
    .from('education_progress')
    .select('concepto, estado, rung, intervalo, errores, ease_factor, next_review, ultima_forma_explicada')
    .eq('user_id', userId);
  if (error) return null; // 42P01 (tabla) / 42703 (columna) / cualquier otra → sin repaso
  return data || [];
}

// Siembra el primer next_review (rung 0 → +1 día) al aprender un concepto por primera vez. Best-effort:
// si las columnas SRS no existen o REPASO_ON está off → no-op (la lección/quiz ya se guardó). Nunca lanza.
async function sembrarSiNuevo(supabase, userId, concepto, hoy) {
  if (!REPASO_ON) return;
  try {
    const { data, error } = await supabase.from('education_progress').select('next_review').eq('user_id', userId).eq('concepto', concepto).maybeSingle();
    if (error || (data && data.next_review)) return; // columna ausente o ya programado → nada
    await supabase.from('education_progress').upsert(
      { user_id: userId, concepto, estado: 'aprendiendo', rung: 0, ease_factor: SRS.EASE_DEFAULT, intervalo: 0, aciertos_consecutivos: 0, next_review: sumarDias(hoy, 1), ultimo_visto: hoy, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,concepto', ignoreDuplicates: false },
    );
  } catch { /* SRS no disponible → noop */ }
}

// Mapa por-tema para "Mi aprendizaje" (Rams): todos los temas del curriculum vivo con su estado calmado
// (nuevo/aprendiendo/dominado) y si están listos para reforzar. 'visto' legacy → 'aprendiendo'. Sin fila →
// 'nuevo'. Se exponen `due` y `listo_para_reforzar` (mismo valor) para que el mapa lo consuma sin adivinar.
function construirTemas(rows, hoy) {
  const porConcepto = new Map((rows || []).map((r) => [r.concepto, r]));
  return TEMAS_VALIDOS.map((concepto) => {
    const r = porConcepto.get(concepto);
    const estado = !r ? 'nuevo' : (r.estado === 'dominado' ? 'dominado' : 'aprendiendo');
    const due = !!(REPASO_ON && r?.next_review && r.next_review <= hoy);
    return { concepto, titulo: CATALOGO[concepto]?.titulo || concepto, estado, due, listo_para_reforzar: due };
  });
}

// Construye el ItemRepaso del tema DUE con cifras del motor (targets/meals). Contrato acordado con Rams:
// repaso.item = { contexto, pregunta, opciones, correcta, feedback_ok, feedback_no } (contexto puede venir
// null si falta el dato del motor). Aplica el cinturón esDatoDeSalud (reuso, no duplico): si el texto
// ensamblado tocara un dato de salud → se descarta (repaso:null).
async function armarRepaso(supabase, userId, rows, hoy) {
  const sel = seleccionarDue(rows, hoy, TEMAS_VALIDOS);
  if (!sel) return null;
  const fila = (rows || []).find((r) => r.concepto === sel.concepto) || {};
  const [{ data: targets }, { data: meals }] = await Promise.all([
    supabase.from('nutrition_targets').select('kcal_target, protein_g, carbs_g').eq('user_id', userId).maybeSingle(),
    supabase.from('meals').select('protein_g').eq('user_id', userId).eq('date', hoy),
  ]);
  const protConsumida = (meals || []).reduce((a, m) => a + (m.protein_g || 0), 0);
  const slots = {
    prot_consumida: (meals && meals.length) ? Math.round(protConsumida) : null,
    prot_meta: targets?.protein_g ? Math.round(targets.protein_g) : null,
    kcal_meta: targets?.kcal_target ? Math.round(targets.kcal_target) : null,
    carb_meta: targets?.carbs_g ? Math.round(targets.carbs_g) : null, // macros v2 (del motor; sin dato → contexto omitido)
  };
  const forma = elegirForma(sel.concepto, diaDelAno(hoy), fila.ultima_forma_explicada || null);
  if (!forma) return null;
  // Slot {{ingrediente}} (calidad_sin_culpa v1): SOLO desde la despensa filtrada por alérgenos. Si no hay
  // uno seguro → queda null → construirItemRepaso omite el contexto (NUNCA nombra un alimento sin filtrar).
  if (forma.contexto && /\{\{ingrediente\}\}/.test(forma.contexto)) {
    slots.ingrediente = await ingredienteSeguro(supabase, userId);
  }
  const item = construirItemRepaso(sel.concepto, forma, slots);
  if (!item) return null;
  // Cinturón: el contenido es fijo/QA'd, pero reusamos el guard vivo como belt-and-suspenders.
  const txt = [item.contexto, item.pregunta, item.feedback_ok, item.feedback_no, ...(item.opciones || [])].filter(Boolean).join(' ');
  if (esDatoDeSalud(txt)) return null;
  return { concepto: sel.concepto, titulo: item.titulo, pendientes: sel.pendientes, atrasado_dias: sel.atrasado_dias, item };
}

// GET → { nivel, vistos, ofrecer, repaso, temas }. `temas` = mapa por-tema (nuevo/aprendiendo/dominado +
// listo_para_reforzar) para "Mi aprendizaje" (omitido si no hay SRS → Rams cae al contador). `repaso` = 1
// ítem due con su `item` (o null): gated por back-off + REPASO_ON; prioridad repaso-due > lección nueva.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    const { data: perfil } = await supabase.from('nutrition_profiles').select('nutrition_knowledge_level, coach_params').eq('user_id', user.id).maybeSingle();
    const { vistos } = await estado(supabase, user.id);
    const ignoradas = perfil?.coach_params?.edu_ofertas_ignoradas || 0;
    const ofrecer = debeOfrecerLeccion(ignoradas); // back-off: si ignoró 2, deja de ofrecer
    const hoy = localDateTime().date;

    // Filas con SRS (best-effort). null = tabla/columnas ausentes → sin mapa ni repaso (Rams degrada al contador).
    const rows = await repasoRows(supabase, user.id);
    const temas = rows ? construirTemas(rows, hoy) : undefined; // mapa por-tema (Free, siempre útil)
    // Repaso (oferta): solo si el flag está on Y el back-off permite ofrecer (una sola oferta por apertura).
    let repaso = null;
    if (REPASO_ON && ofrecer && rows) repaso = await armarRepaso(supabase, user.id, rows, hoy);

    return NextResponse.json({ nivel: perfil?.nutrition_knowledge_level || null, vistos, ofrecer, repaso, temas });
  } catch (err) {
    console.error('educacion GET EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
  }
}

// POST acciones:
//   { accion:'leccion', concepto }               → micro-lección anclada a datos reales (marca 'visto' + siembra SRS)
//   { accion:'quiz', concepto, correcto }         → registra acierto/fallo (contadores)
//   { accion:'repaso', concepto, correcto, confianza? } → SM-2: reprograma next_review + estado (Free, $0)
//   { accion:'oferta', acepto }                   → back-off: persiste edu_ofertas_ignoradas (revive el contador)
export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { date: hoy } = localDateTime();

    // ── accion 'oferta': no requiere concepto. Revive el back-off (hoy se lee pero nadie lo escribía). ──
    if (body.accion === 'oferta') {
      const { data: perfil } = await supabase.from('nutrition_profiles').select('coach_params').eq('user_id', user.id).maybeSingle();
      const cp = (perfil && typeof perfil.coach_params === 'object' && perfil.coach_params) || {};
      const nuevas = trasOferta(cp.edu_ofertas_ignoradas || 0, !!body.acepto);
      const { error } = await supabase.from('nutrition_profiles').update({ coach_params: { ...cp, edu_ofertas_ignoradas: nuevas } }).eq('user_id', user.id);
      if (error) console.error('oferta back-off update:', { code: error.code });
      return NextResponse.json({ ok: true, ofrecer: debeOfrecerLeccion(nuevas) });
    }

    // El resto de acciones requieren un concepto válido. 'repaso' admite cualquier tema del curriculum
    // (incluye 'macros'); 'quiz'/'leccion' solo los que tienen micro-lección (CONCEPTOS_MVP).
    const concepto = String(body.concepto || '');
    const conceptosValidos = body.accion === 'repaso' ? TEMAS_VALIDOS : CONCEPTOS_MVP;
    if (!conceptosValidos.includes(concepto)) return NextResponse.json({ error: 'no_concepto' }, { status: 400 });

    // ── accion 'repaso': SM-2 determinista ($0). Reprograma next_review + estado; re-enseña con otra forma en fallo. ──
    if (body.accion === 'repaso') {
      const { data: prev } = await supabase
        .from('education_progress')
        .select('rung, intervalo, ease_factor, aciertos_consecutivos, aciertos, errores, ultimo_visto, ultima_forma_explicada')
        .eq('user_id', user.id).eq('concepto', concepto).maybeSingle();
      const correcto = !!body.correcto;
      const conPista = body.confianza === 'pista' || body.confianza === 'duda';
      const prog = programarRepaso(prev || {}, { correcto, conPista }, hoy);
      // Forma mostrada hoy (determinista, igual que la que sirvió el GET) → se registra para rotar la
      // re-enseñanza. Si el cliente la manda explícita, tiene prioridad.
      const formaHoy = elegirForma(concepto, diaDelAno(hoy), prev?.ultima_forma_explicada || null);
      const fila = {
        user_id: user.id, concepto,
        estado: prog.estado,
        rung: prog.rung, intervalo: prog.intervalo, ease_factor: prog.ease_factor,
        aciertos_consecutivos: prog.aciertos_consecutivos,
        aciertos: (prev?.aciertos || 0) + (correcto && !conPista ? 1 : 0),
        errores: (prev?.errores || 0) + (correcto ? 0 : 1),
        next_review: prog.next_review,
        ultima_forma_explicada: (typeof body.forma === 'string' && body.forma) ? body.forma : (formaHoy?.id || prev?.ultima_forma_explicada || null),
        ultimo_visto: hoy, updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('education_progress').upsert(fila, { onConflict: 'user_id,concepto' });
      if (error) { console.error('repaso upsert:', { code: error.code, details: error.details }); return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 }); }
      return NextResponse.json({ ok: true, next_review: prog.next_review, intervalo: prog.intervalo, estado: prog.estado, reensena: prog.reensena });
    }

    if (body.accion === 'quiz') {
      const { data: prev } = await supabase.from('education_progress').select('aciertos, errores').eq('user_id', user.id).eq('concepto', concepto).maybeSingle();
      const patch = patchQuiz(prev, !!body.correcto);
      const { error } = await supabase.from('education_progress').upsert(
        { user_id: user.id, concepto, ...patch, ultimo_visto: hoy, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,concepto' },
      );
      if (error) { console.error('quiz upsert:', { code: error.code, details: error.details }); return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 }); }
      await sembrarSiNuevo(supabase, user.id, concepto, hoy); // entra al ciclo de repaso (best-effort)
      return NextResponse.json({ ok: true });
    }

    // accion 'leccion' (default): gating degustación + datos reales.
    const { data: plan } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle();
    const isPro = plan?.plan === 'premium';
    const { vistos } = await estado(supabase, user.id);
    if (!isPro && vistos >= DEGUSTACION_FREE) {
      return NextResponse.json({ pro: true, mensaje: 'Ya viste tus micro-lecciones gratis. Con Pro son ilimitadas.' });
    }

    const [{ data: targets }, { data: meals }] = await Promise.all([
      supabase.from('nutrition_targets').select('kcal_target, protein_g, carbs_g, fat_g').eq('user_id', user.id).maybeSingle(),
      supabase.from('meals').select('protein_g').eq('user_id', user.id).eq('date', hoy),
    ]);
    const protConsumida = (meals || []).reduce((a, m) => a + (m.protein_g || 0), 0);
    const lec = leccionDe(concepto);
    const cuerpo = lec.cuerpo({
      protConsumida, protObjetivo: targets?.protein_g, kcalObjetivo: targets?.kcal_target,
      carbObjetivo: targets?.carbs_g, grasObjetivo: targets?.fat_g, // macros: metas del motor (nunca inventa)
    });

    // Marca 'visto' (idempotente por concepto).
    await supabase.from('education_progress').upsert(
      { user_id: user.id, concepto, estado: 'visto', ultimo_visto: hoy, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,concepto', ignoreDuplicates: false },
    );
    await sembrarSiNuevo(supabase, user.id, concepto, hoy); // entra al ciclo de repaso (best-effort)
    return NextResponse.json({ titulo: lec.titulo, cuerpo, quiz: lec.quiz, concepto });
  } catch (err) {
    console.error('educacion POST EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
  }
}
