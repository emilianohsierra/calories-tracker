// Núcleo determinista compartido (plan/ola1-formulas-coaches.md §0). Funciones PURAS.
// Unidades: peso kg, altura cm, energía kcal, macros g. Sin IA.

export const ACTIVITY_FACTORS = {
  sedentario: 1.2,
  ligero: 1.375,
  moderado: 1.55,
  alto: 1.725,
  muy_alto: 1.9,
};
export const KCAL_POR_KG_GRASA = 7700;
// Piso duro de seguridad por sexo biológico.
export const PISO_KCAL_SEXO = { male: 1500, female: 1200 };

// BMR — Katch-McArdle si hay % grasa fiable (3–60), si no Mifflin-St Jeor.
export function bmr({ sex, weightKg, heightCm, age, bodyFatPct = null }) {
  if (bodyFatPct != null && bodyFatPct >= 3 && bodyFatPct <= 60) {
    const leanMass = weightKg * (1 - bodyFatPct / 100);
    return { value: 370 + 21.6 * leanMass, method: 'katch' };
  }
  const s = sex === 'male' ? 5 : -161;
  return { value: 10 * weightKg + 6.25 * heightCm - 5 * age + s, method: 'mifflin' };
}

export function tdee(bmrVal, activityKey) {
  const factor = ACTIVITY_FACTORS[activityKey];
  return bmrVal * factor;
}

// Piso de kcal: nunca por debajo de BMR·1.1 ni del piso por sexo (§0.4).
export function pisoKcal(bmrVal, sex) {
  return Math.max(bmrVal * 1.1, PISO_KCAL_SEXO[sex] || 1200);
}

// Topes de déficit (§0.4): piso + ritmo de pérdida ≤ 1%/sem.
export function aplicaTopesDeficit({ objetivo, tdeeVal, bmrVal, sex, weightKg, deficitDia }) {
  const piso = pisoKcal(bmrVal, sex);
  let obj = Math.max(objetivo, piso);
  const perdidaSemKg = (deficitDia * 7) / KCAL_POR_KG_GRASA;
  if (perdidaSemKg > 0.01 * weightKg) {
    const maxDeficitDia = (0.01 * weightKg * KCAL_POR_KG_GRASA) / 7;
    obj = tdeeVal - maxDeficitDia;
    obj = Math.max(obj, piso);
  }
  return obj;
}

// Reparto de macros (§0.5): prot/fat por g/kg; carbos = resto. Si los carbos salen
// negativos, baja la grasa a su piso 0.8 g/kg y marca warn (avisar, NO bloquear).
export function macros({ objetivoKcal, weightKg, proteinPerKg, fatPerKg }) {
  const protG = Math.round(proteinPerKg * weightKg);
  let fatG = Math.round(fatPerKg * weightKg);
  let carbKcal = objetivoKcal - protG * 4 - fatG * 9;
  let warn = false;
  if (carbKcal < 0) {
    fatG = Math.round(0.8 * weightKg);
    carbKcal = objetivoKcal - protG * 4 - fatG * 9;
    warn = true;
  }
  const carbG = Math.round(Math.max(carbKcal, 0) / 4);
  return { protG, carbG, fatG, warn };
}

// Hidratación (§0.6): 35 ml/kg + ~600 ml por hora de entreno.
export function hidratacionMl(weightKg, minEntrenoDia = 0) {
  return Math.round(35 * weightKg + (minEntrenoDia / 60) * 600);
}

export function fibraG(objetivoKcal) {
  return Math.round((14 * objetivoKcal) / 1000);
}
