// Ejecutores de las tools de acción del coach (Fase 1 R3). Cada ejecutor corre en el
// backend, REUSA la lógica existente y usa números del MOTOR/BD o del análisis de visión
// —NUNCA del modelo—. El filtro de alérgenos es CÓDIGO (no prompt).
import { validateMeal } from '../meals/insert';
import { findViolations } from './allergens';
import { localDateTime } from './context';

const MOMENTOS = ['desayuno', 'comida', 'cena', 'snack'];

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
