import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { localDateTime } from '@/lib/coach/context';
import { esDatoDeSalud } from '@/lib/coach/actions';
import { explicarConcepto } from '@/lib/coach/educacion';
import { EXPLICACIONES, NIVEL_DEFAULT } from '@/lib/coach/curriculum';

// Coach · Educación — "¿Por qué?" on-demand (afordance de 1 tap + preguntas de por-qué). Explica al
// NIVEL del usuario con base DETERMINISTA (curriculum) + personalización Haiku opcional (post-check
// anti-TCA + fallback). Cifras del motor. Gate de salud reusa esDatoDeSalud → deriva a profesional.
// Free (Drucker: no cobrar por entender tu salud). Deploy-safe.
export const runtime = 'nodejs';
const COACH_MODEL = 'claude-haiku-4-5';

// Detecta el concepto desde texto libre (o usa el explícito de la afordance).
function conceptoDe(body) {
  if (typeof body.concepto === 'string' && EXPLICACIONES[body.concepto]) return body.concepto;
  const t = String(body.pregunta || '').toLowerCase();
  if (/(proteina|proteína)/.test(t)) return 'proteina';
  if (/(deficit|déficit|bajar de grasa|bajar grasa|adelgaz)/.test(t)) return 'deficit';
  if (/(sello|etiqueta|nom-?051|calidad|ultraprocesad|nutri)/.test(t)) return 'calidad_sin_culpa';
  return null;
}

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // GATE DE SALUD (reuso, no duplico): si la pregunta toca condición/síntoma/alergia → NO damos
    // contenido clínico; educación general breve + derivar a profesional.
    if (body.pregunta && esDatoDeSalud(body.pregunta)) {
      return NextResponse.json({
        derivar: true,
        titulo: 'Mejor con un profesional',
        texto: 'Eso toca tu salud y no puedo darte indicaciones clínicas. Te ayudo con hábitos y nutrición general; para tu caso concreto, consúltalo con un profesional de salud.',
      });
    }

    const concepto = conceptoDe(body);
    if (!concepto) return NextResponse.json({ error: 'no_concepto' }, { status: 400 });

    const { date } = localDateTime();
    const [{ data: perfil }, { data: targets }, { data: meals }] = await Promise.all([
      supabase.from('nutrition_profiles').select('nutrition_knowledge_level, coach').eq('user_id', user.id).maybeSingle(),
      supabase.from('nutrition_targets').select('kcal_target, protein_g').eq('user_id', user.id).maybeSingle(),
      supabase.from('meals').select('protein_g').eq('user_id', user.id).eq('date', date),
    ]);
    const prot = (meals || []).reduce((a, m) => a + (m.protein_g || 0), 0);
    const nivel = perfil?.nutrition_knowledge_level || NIVEL_DEFAULT;
    const ctx = { targets: targets || null, today: { prot, pendientes: targets ? {} : null } };

    // Fase B.5 CONSTRUIDA pero APAGADA por flag (default off) → devolvemos la BASE DETERMINISTA (ya
    // correcta, adaptada a los 4 niveles + línea de datos reales): 0 llamadas a Haiku, 0 costo. Con
    // el flag OFF el comportamiento en prod NO cambia respecto al MVP.
    //
    // El camino de personalización IA (encendido con EDUCACION_IA_ON=1) ya usa: PROMPT ESTRICTO
    // (redactarPorque, barrera primaria) → esDatoDeSalud (gate incondicional, ya corrió arriba) →
    // POST-CHECK EDUCATIVO propio (verificarEducacionIA, vía explicarConcepto: permite vocabulario
    // educativo neutro —peso/grasa/déficit/IMC/composición— y bloquea solo TCA real, protegiendo las
    // cifras reales) → si descarta / Haiku falla / kill-switch → FALLBACK a la base + reembolso.
    // Se ENCIENDE (EDUCACION_IA_ON=1) SOLO tras la QA adversarial (Slowking/Nielsen/Karpathy).
    const iaOn = process.env.EDUCACION_IA_ON === '1';
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    const anthropic = (iaOn && apiKey) ? new Anthropic({ apiKey }) : null;
    const rid = crypto.randomUUID();

    const out = anthropic
      ? await explicarConcepto(
        {
          anthropic,
          reservar: async () => {
            const { data, error } = await supabase.rpc('consumir_educacion', { p_request_id: rid });
            if (error) { console.error('consumir_educacion falló:', { code: error.code }); return { allowed: false, reason: 'rpc_error' }; }
            return data;
          },
          reembolsar: async () => { try { await supabase.rpc('reembolsar_ia', { p_request_id: rid }); } catch { /* noop */ } },
          redactar: (base) => redactarPorque({ anthropic, base, nivel }),
        },
        { concepto, nivel, ctx },
      )
      // Flag off → base determinista SIN reservar ni llamar al modelo (0 gasto).
      : await explicarConcepto({ anthropic: null }, { concepto, nivel, ctx });
    if (!out) return NextResponse.json({ error: 'no_concepto' }, { status: 400 });
    return NextResponse.json({ titulo: out.titulo, texto: out.texto, nivel: out.nivel });
  } catch (err) {
    console.error('explicar POST EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo explicar' }, { status: 500 });
  }
}

// PROMPT ESTRICTO (barrera PRIMARIA, Fase B.5). Haiku personaliza la base al nivel del usuario; el
// post-check EDUCATIVO (verificarEducacionIA, dentro de explicarConcepto) es el backstop; si algo se
// sale del carril → fallback a la base determinista. Marco neutro-saludable; educación ≠ medicina.
async function redactarPorque({ anthropic, base, nivel }) {
  const system =
    `Eres un coach de nutrición. Reescribe esta explicación educativa para un usuario de nivel ${nivel}, personalizándola y clara.\n` +
    'REGLAS ABSOLUTAS (si rompes una, fallaste):\n' +
    '1) Educa el "por qué" con marco SIEMPRE neutro y saludable, "añadir, no restringir".\n' +
    '2) PRESERVA EXACTAS las cifras del texto base (los números reales del usuario): cópialas idénticas con su unidad; no las cambies ni las contradigas. NO propongas ingestas ni cifras calóricas/de peso que NO estén en el texto base (nada de "apunta a X kcal" ni "baja Y kg").\n' +
    '3) PROHIBIDO promover: restricción extrema, "deja de comer"/saltarse comidas como estrategia, purga/vómito/laxantes, ayuno peligroso, culpa/vergüenza/castigo por comer, pérdida de peso peligrosamente rápida, dietas cero-carbohidratos o cero-grasa como meta, ejercicio como castigo, o demonizar alimentos ("prohibido/malo/pecado/veneno").\n' +
    '4) SÍ puedes hablar de peso, grasa corporal, déficit/superávit, composición corporal, IMC, calorías y macros en marco neutro-educativo.\n' +
    '5) ANTI-MITOS: no afirmes mitos: no existen alimentos que "quemen grasa", ni que aceleren el metabolismo mágicamente, ni superalimentos milagro; no demonices carbohidratos, grasas ni gluten sin razón clínica (celiaquía/alergia).\n' +
    '6) MÉXICO: usa contexto y ejemplos de México cuando apliquen (tortilla de maíz nixtamalizada, frijol, comida corrida).\n' +
    '7) CERO consejo médico o diagnóstico; ante condiciones o síntomas, deriva a un profesional de salud.\n' +
    '8) Máximo 3 frases, español, sin emojis. Devuelve SOLO el texto reescrito.';
  const r = await anthropic.messages.create({
    model: COACH_MODEL,
    max_tokens: 240,
    system,
    messages: [{ role: 'user', content: base.texto }],
  });
  const parts = Array.isArray(r?.content) ? r.content : [];
  return parts.map((p) => (p?.type === 'text' ? p.text : '')).join('').trim();
}
