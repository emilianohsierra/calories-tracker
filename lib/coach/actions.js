// Ejecutores de las tools de acción del coach (Fase 1 R3). Cada ejecutor corre en el
// backend, REUSA la lógica existente y usa números del MOTOR/BD o del análisis de visión
// —NUNCA del modelo—. El filtro de alérgenos es CÓDIGO (no prompt).
import { validateMeal } from '../meals/insert';
import { findViolations } from './allergens';
import { localDateTime } from './context';

const MOMENTOS = ['desayuno', 'comida', 'cena', 'snack'];

// Tool de estimación (grounding): produce los macros de una comida descrita en texto.
// Es una llamada SEPARADA del chat → los números salen de aquí, no del modelo del chat
// (Karpathy §4.3). Se marcan como "estimado".
const ESTIMAR_TOOL = {
  name: 'estimar_comida',
  description: 'Estima kcal y macros de la porción TOTAL de una comida descrita en texto. Valores realistas (México).',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['titulo', 'kcal', 'prot_g', 'carb_g', 'gras_g', 'ingredientes'],
    properties: {
      titulo: { type: 'string' },
      kcal: { type: 'number' },
      prot_g: { type: 'number' },
      carb_g: { type: 'number' },
      gras_g: { type: 'number' },
      ingredientes: { type: 'array', items: { type: 'string' } },
    },
  },
};

const nOr0 = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);

// Llamada de grounding: estima una comida a partir de su descripción. Devuelve null si falla.
export async function estimarComida({ anthropic, model, descripcion }) {
  const r = await anthropic.messages.create({
    model,
    max_tokens: 400,
    system:
      'Eres un estimador de macros de comida en español (México). Estima valores realistas para la porción TOTAL descrita. Responde SIEMPRE llamando la herramienta estimar_comida; no expliques.',
    tools: [ESTIMAR_TOOL],
    tool_choice: { type: 'tool', name: 'estimar_comida' },
    messages: [{ role: 'user', content: `Comida descrita: "${descripcion}". Estima kcal y macros de la porción total.` }],
  });
  const tb = (r?.content || []).find((b) => b.type === 'tool_use' && b.name === 'estimar_comida');
  if (!tb?.input || typeof tb.input !== 'object') return null;
  return {
    titulo: String(tb.input.titulo || descripcion).trim().slice(0, 120),
    kcal: Math.round(nOr0(tb.input.kcal)),
    prot_g: Math.round(nOr0(tb.input.prot_g)),
    carb_g: Math.round(nOr0(tb.input.carb_g)),
    gras_g: Math.round(nOr0(tb.input.gras_g)),
    ingredientes: Array.isArray(tb.input.ingredientes)
      ? tb.input.ingredientes.slice(0, 20).map((s) => String(s).slice(0, 60))
      : [],
  };
}

// registrar_texto (Karpathy §4.3): estima la comida descrita y la PROPONE (no escribe).
// La mutación real ocurre en UI al confirmar (POST /api/meals) — confirmación antes de
// mutar (requisito del Director). Marca alérgeno en código (aviso).
export async function registrarTexto({ anthropic, model, input, ctx }) {
  const descripcion = String(input?.descripcion || '').trim().slice(0, 300);
  if (!descripcion) return { toolResult: { ok: false, error: 'sin_descripcion' } };
  const momento = MOMENTOS.includes(input?.momento) ? input.momento : 'comida';
  const est = await estimarComida({ anthropic, model, descripcion });
  if (!est) return { toolResult: { ok: false, error: 'sin_estimacion' } };

  const restr = [...(ctx?.profile?.allergies || []), ...(ctx?.profile?.intolerances || [])];
  const alergenos = findViolations(est.ingredientes, restr);

  return {
    estimate: { ...est, momento },
    toolResult: {
      ok: true,
      estimado: true,
      titulo: est.titulo,
      kcal: est.kcal,
      momento,
      alerta_alergeno: alergenos.length > 0,
      alergenos,
      nota: 'Números estimados; se registran cuando la persona confirme.',
    },
  };
}

// registrar_comida_foto (Karpathy §4.2): guarda una comida a partir de un análisis de
// foto YA realizado (flujo de visión existente /api/analyze). Los macros salen del
// análisis, no del chat. El registro NO se bloquea por alérgeno, pero se MARCA (aviso).
export async function registrarComidaFoto({ supabase, userId, input, analysis, ctx }) {
  if (!analysis || typeof analysis !== 'object') {
    return { toolResult: { ok: false, error: 'sin_analisis' } };
  }
  const momento = MOMENTOS.includes(input?.momento)
    ? input.momento
    : MOMENTOS.includes(analysis.tipo_comida)
      ? analysis.tipo_comida
      : 'comida';
  const correccion = String(input?.correccion || '').trim().slice(0, 200);
  const ingredientes = Array.isArray(analysis.ingredientes) ? analysis.ingredientes : [];
  const { date, time } = localDateTime();

  // Reusa validateMeal (misma validación/coerción que /api/meals). Números del análisis.
  const v = validateMeal({
    date,
    time,
    title: analysis.titulo || 'Comida',
    description: correccion
      ? `${analysis.descripcion || ''} (corrección: ${correccion})`.trim()
      : analysis.descripcion || '',
    meal_type: momento,
    calories: analysis.calorias,
    protein_g: analysis.proteinas_g,
    carbs_g: analysis.carbohidratos_g,
    fat_g: analysis.grasas_g,
    ingredients: ingredientes,
    confidence: analysis.confianza,
    image: analysis.imagen,
  });
  if (!v.ok) return { toolResult: { ok: false, error: v.error } };

  // Filtro DURO de alérgenos EN CÓDIGO: el registro no se bloquea (la persona registra
  // lo que comió), pero se marca si viola una restricción declarada.
  const restr = [...(ctx?.profile?.allergies || []), ...(ctx?.profile?.intolerances || [])];
  const alergenos = findViolations(ingredientes, restr);

  const { error } = await supabase.from('meals').insert({ user_id: userId, ...v.row });
  if (error) {
    console.error('registrar_comida_foto insert:', error.message);
    return { toolResult: { ok: false, error: 'db' } };
  }

  // Pendientes tras registrar (motor/BD): pendientes_antes − macros de esta comida.
  const before = ctx?.today?.pendientes || {};
  const pendientes_tras = {
    kcal: Math.round((before.kcal ?? 0) - v.row.calories),
    prot: Math.round((before.prot ?? 0) - v.row.protein_g),
    carb: Math.round((before.carb ?? 0) - v.row.carbs_g),
    fat: Math.round((before.fat ?? 0) - v.row.fat_g),
  };

  return {
    guardado: { titulo: v.row.title, kcal: v.row.calories, prot: v.row.protein_g, momento },
    toolResult: {
      ok: true,
      titulo: v.row.title,
      kcal: v.row.calories,
      prot_g: v.row.protein_g,
      momento,
      alerta_alergeno: alergenos.length > 0,
      alergenos,
      pendientes_tras,
    },
  };
}
