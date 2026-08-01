// Briefing DETERMINISTA para la HOME (Rams → BriefingCard). Números SOLO del MOTOR
// (nutrition_targets / computeTargets) y de meals. La coachLine se arma con datos
// deterministas (pendiente de proteína, luego kcal) — 0 IA, 0 cifras inventadas.
//
// FORMA reconciliada con el contrato que la UI de Rams ya consume (lib/coach/homeBriefing.js):
//   GET /api/coach/home-briefing -> { entrenoDelDia:{title,when?}|null,
//     macrosObjetivo:{kcal,protein_g,carbs_g,fat_g}, macrosConsumidos:{kcal,protein_g,carbs_g,fat_g},
//     coachLine:string }
// getHomeBriefing devuelve además date/coach (extras inofensivos para otros usos internos).
//
// Firma: getHomeBriefing(supabase, userId) — supabase inyectado, IGUAL que
// assembleContext(supabase, userId, ...) del módulo vivo (una lib no crea su cliente auth).
// ADITIVO: no toca lib/coach/actions.js ni lib/nutrition.
import { computeTargets } from '../nutrition/compute';
import { getCoachMeta } from './registry';
import { localDateTime } from './context';

const r = (n) => Math.round(Number.isFinite(Number(n)) ? Number(n) : 0);

// Suma determinista de las comidas del día (misma lógica que lib/coach/context.js).
// Usa las claves del contrato (protein_g/carbs_g/fat_g).
function sumMeals(meals) {
  const acc = (meals || []).reduce(
    (a, m) => ({
      kcal: a.kcal + (m.calories || 0),
      protein_g: a.protein_g + (m.protein_g || 0),
      carbs_g: a.carbs_g + (m.carbs_g || 0),
      fat_g: a.fat_g + (m.fat_g || 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
  return { kcal: r(acc.kcal), protein_g: r(acc.protein_g), carbs_g: r(acc.carbs_g), fat_g: r(acc.fat_g) };
}

// Metas del MOTOR: usa nutrition_targets (ya calculado por el motor); si falta pero hay perfil
// utilizable, recalcula con computeTargets (misma matemática, sin drift). null si no hay datos.
function targetsFromMotor(targets, profile) {
  if (targets) {
    return {
      kcal: r(targets.kcal_target), protein_g: r(targets.protein_g), carbs_g: r(targets.carbs_g),
      fat_g: r(targets.fat_g), fiber_g: r(targets.fiber_g), water_ml: r(targets.water_ml),
    };
  }
  if (profile?.coach && profile?.sex && profile?.weight_kg) {
    try {
      const t = computeTargets(profile);
      return {
        kcal: r(t.kcal_target), protein_g: r(t.protein_g), carbs_g: r(t.carbs_g),
        fat_g: r(t.fat_g), fiber_g: r(t.fiber_g), water_ml: r(t.water_ml),
      };
    } catch {
      return null;
    }
  }
  return null;
}

// coachLine 100% determinista: UNA frase, tono neutro-cercano, anclada a datos. Prioriza el
// pendiente de proteína, luego kcal. Sin emojis, sin markdown, sin porras. Números del motor/
// meals (nunca del modelo). EXPORTADA para test unitario.
export function buildCoachLine({ objetivo, consumido }) {
  if (!objetivo) return 'Completa tu perfil para calcular tus metas del día.';
  const protPend = objetivo.protein_g - consumido.protein_g;
  const kcalPend = objetivo.kcal - consumido.kcal;
  if (protPend > 0) {
    return `Proteína: llevas ${consumido.protein_g} de ${objetivo.protein_g} g. Te faltan ${protPend} g.`;
  }
  if (kcalPend > 0) {
    return `Llevas ${consumido.kcal} de ${objetivo.kcal} kcal hoy. Te quedan ${kcalPend} kcal.`;
  }
  if (kcalPend < 0) {
    return `Vas ${Math.abs(kcalPend)} kcal por encima de tu meta de hoy.`;
  }
  return 'Vas al día con tus metas de hoy.';
}

// entrenoDelDia { title, when? } | null. Sin tabla de agenda aún: (1) sesión planificada en
// coach_params.entreno_hoy si existe; (2) estado registrado hoy (coach_day_state); (3) null.
function buildEntreno(dayState, profile) {
  const cp = (profile && typeof profile.coach_params === 'object' && profile.coach_params) || {};
  const planned = cp.entreno_hoy;
  if (planned && typeof planned === 'object' && planned.title) {
    const e = { title: String(planned.title) };
    if (planned.hora || planned.when) e.when = String(planned.hora || planned.when);
    return e;
  }
  if (dayState?.entreno_estado) {
    const titulos = { hecho: 'Entrenamiento completado', omitido: 'Entrenamiento omitido', pendiente: 'Entrenamiento de hoy' };
    return { title: titulos[dayState.entreno_estado] || 'Entrenamiento' };
  }
  return null;
}

// getHomeBriefing(supabase, userId) → objeto para la BriefingCard de la HOME.
export async function getHomeBriefing(supabase, userId) {
  const { date } = localDateTime();

  // coach_day_state es deploy-safe: si la tabla no existe aún, .maybeSingle() devuelve
  // { data:null } sin romper (mismo patrón que context.js).
  const [profileRes, targetsRes, mealsRes, dayStateRes] = await Promise.all([
    supabase.from('nutrition_profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('nutrition_targets').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('meals').select('calories, protein_g, carbs_g, fat_g').eq('user_id', userId).eq('date', date),
    supabase.from('coach_day_state').select('entreno_estado, hora_comida').eq('user_id', userId).eq('date', date).maybeSingle(),
  ]);
  const profile = profileRes?.data || null;
  const targets = targetsRes?.data || null;
  const meals = mealsRes?.data || [];
  const dayState = dayStateRes?.data || null;

  const coachMeta = profile?.coach ? getCoachMeta(profile.coach) : null;
  const coach = coachMeta ? { id: coachMeta.id, nombre: coachMeta.nombre, icono: coachMeta.icono } : null;

  const objetivo = targetsFromMotor(targets, profile);
  const consumido = sumMeals(meals);
  const coachLine = buildCoachLine({ objetivo, consumido });
  const entrenoDelDia = buildEntreno(dayState, profile);

  return {
    date,
    coach, // { id, nombre, icono } | null  (extra; la UI usa el icono si lo quiere)
    entrenoDelDia, // { title, when? } | null
    macrosObjetivo: objetivo, // { kcal, protein_g, carbs_g, fat_g, fiber_g, water_ml } | null
    macrosConsumidos: consumido, // { kcal, protein_g, carbs_g, fat_g }
    coachLine, // string determinista, 1 frase
  };
}
