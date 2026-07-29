import { getCoach } from './coaches';
import { bmr, pisoKcal, aplicaTopesDeficit, macros, hidratacionMl, fibraG, KCAL_POR_KG_GRASA } from './formulas';

// Clampa el PAL al rango válido 1.2–1.9 (Karpathy R2): evita NaN si llega undefined/fuera
// de rango, aunque /api/profile ya valida. Default sensato = moderado (1.55).
function clampPal(pal) {
  const n = Number(pal);
  if (!Number.isFinite(n)) return 1.55;
  return Math.min(Math.max(n, 1.2), 1.9);
}

// Motor DETERMINISTA (plan/ola1-formulas-coaches.md). Perfil → plan calculado.
// Sin IA. `profile.coach_params` trae las respuestas específicas del coach
// (ritmo, experiencia, km_semana, foco…). Devuelve el objeto para nutrition_targets.
export function computeTargets(profile) {
  const coach = getCoach(profile.coach);
  if (!coach) {
    const err = new Error(`Coach no válido: ${profile.coach}`);
    err.code = 'BAD_COACH';
    throw err;
  }

  const sex = profile.sex;
  const weightKg = profile.weight_kg;
  const cp = profile.coach_params && typeof profile.coach_params === 'object' ? profile.coach_params : {};

  const { value: bmrVal, method } = bmr({
    sex,
    weightKg,
    heightCm: profile.height_cm,
    age: profile.age,
    bodyFatPct: profile.body_fat_pct ?? null,
  });

  // TDEE = BMR · PAL (PAL continuo, clampado a 1.2–1.9 para evitar NaN).
  const tdeeStd = bmrVal * clampPal(profile.activity_pal);

  let tdeeVal;
  let objetivo;
  let minEntrenoDia = 0;
  const proteinPerKg = coach.proteinPerKg;
  const fatPerKg = coach.fatPerKg;

  if (coach.id === 'perdida_grasa') {
    tdeeVal = tdeeStd;
    const ritmo = coach.deficitByRitmo[cp.ritmo] ? cp.ritmo : coach.defaultRitmo;
    const defPct = coach.deficitByRitmo[ritmo];
    objetivo = tdeeVal * (1 - defPct);
    const deficitDia = tdeeVal - objetivo;
    objetivo = aplicaTopesDeficit({ objetivo, tdeeVal, bmrVal, sex, weightKg, deficitDia });
  } else if (coach.id === 'hipertrofia') {
    tdeeVal = tdeeStd;
    const exp = coach.surplusByExp[cp.experiencia] ? cp.experiencia : coach.defaultExp;
    const supPct = coach.surplusByExp[exp];
    objetivo = tdeeVal * (1 + supPct);
    // Tope de ritmo de ganancia (evitar exceso de grasa).
    const maxGainSem = coach.maxGainPctByExp[exp] * weightKg;
    const surplusDia = objetivo - tdeeVal;
    if ((surplusDia * 7) / KCAL_POR_KG_GRASA > maxGainSem) {
      objetivo = tdeeVal + (maxGainSem * KCAL_POR_KG_GRASA) / 7;
    }
    objetivo = Math.max(objetivo, pisoKcal(bmrVal, sex));
  } else if (coach.id === 'runner') {
    // TDEE con entreno explícito (evita doble conteo con PAL).
    const tBase = bmrVal * coach.palBase;
    const kmSemana = Number(cp.km_semana) || 0;
    const kmDia = cp.km_dia != null ? Number(cp.km_dia) : kmSemana / 7;
    const kcalEntreno = coach.kcalPorKgKm * weightKg * kmDia;
    tdeeVal = tBase + kcalEntreno;
    objetivo = tdeeVal;
    if (cp.quiere_bajar_grasa) {
      const defPct = Math.min(Number(cp.deficit_pct) || coach.maxDeficitPct, coach.maxDeficitPct);
      objetivo = objetivo * (1 - defPct);
    }
    objetivo = Math.max(objetivo, pisoKcal(bmrVal, sex));
    // minutos de entreno para hidratación (estimación simple: 6 min/km si no hay ritmo)
    const minPorKm = Number(cp.min_por_km) || 6;
    minEntrenoDia = kmDia > 0 ? Math.round(kmDia * minPorKm) : 0;
  } else {
    // bienestar: mantenimiento
    tdeeVal = tdeeStd;
    objetivo = Math.max(tdeeVal, pisoKcal(bmrVal, sex));
  }

  let M = macros({ objetivoKcal: objetivo, weightKg, proteinPerKg, fatPerKg });

  // Guardrail de carbos para runner: mínimo por volumen (baja grasa hasta piso 0.8 g/kg).
  if (coach.id === 'runner') {
    const kmSemana = Number(cp.km_semana) || 0;
    const carbMinGkg = coach.carbMinByKm.find((t) => kmSemana >= t.km).gkg;
    if (M.carbG < carbMinGkg * weightKg) {
      const fatFloorG = Math.round(0.8 * weightKg);
      const carbKcal = objetivo - M.protG * 4 - fatFloorG * 9;
      M = { protG: M.protG, fatG: fatFloorG, carbG: Math.round(Math.max(carbKcal, 0) / 4), warn: M.warn };
    }
  }

  return {
    bmr: Math.round(bmrVal),
    tdee: Math.round(tdeeVal),
    kcal_target: Math.round(objetivo),
    protein_g: M.protG,
    carbs_g: M.carbG,
    fat_g: M.fatG,
    fiber_g: fibraG(objetivo),
    water_ml: hidratacionMl(weightKg, minEntrenoDia),
    method,
    warn: M.warn, // aviso suave para la UI (carbos exprimidos); no bloquea
  };
}
