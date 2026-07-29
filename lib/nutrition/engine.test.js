import { describe, it, expect } from 'vitest';
import { computeTargets } from './compute';
import { macros, aplicaTopesDeficit, pisoKcal, bmr } from './formulas';

// Blindaje de la MATEMÁTICA DE SALUD (plan/ola1-formulas-coaches.md). Si algo se rompe
// en silencio, estos tests fallan en CI. Cubren: sanity checks por coach + topes de seguridad.

describe('BMR', () => {
  it('Mifflin-St Jeor hombre/mujer', () => {
    expect(bmr({ sex: 'male', weightKg: 72, heightCm: 178, age: 35 }).value).toBeCloseTo(1662.5, 1);
    expect(bmr({ sex: 'female', weightKg: 70, heightCm: 165, age: 30 }).value).toBeCloseTo(1420.25, 1);
  });
  it('usa Katch-McArdle si hay % grasa fiable', () => {
    const r = bmr({ sex: 'male', weightKg: 80, heightCm: 180, age: 30, bodyFatPct: 20 });
    expect(r.method).toBe('katch');
    expect(r.value).toBeCloseTo(370 + 21.6 * 64, 1); // MLG = 80*0.8 = 64
  });
});

describe('Sanity checks por coach (plan/ola1-formulas-coaches.md)', () => {
  it('PÉRDIDA DE GRASA — mujer 30/70/165, ligero, moderado', () => {
    const t = computeTargets({
      coach: 'perdida_grasa',
      sex: 'female',
      age: 30,
      weight_kg: 70,
      height_cm: 165,
      activity_pal: 1.375,
      coach_params: { ritmo: 'moderado' },
    });
    expect(t.bmr).toBe(1420);
    expect(t.method).toBe('mifflin');
    expect(t.kcal_target).toBe(1562); // = piso BMR·1.1 (déficit tocó el piso)
    expect(t.protein_g).toBe(140); // 2.0 g/kg
    expect(t.fat_g).toBe(56); // 0.8 g/kg
    expect(t.carbs_g).toBe(125); // resto (~124 en doc, dif. de redondeo)
    expect(t.warn).toBe(false);
  });

  it('RUNNER — hombre 35/72/178, 40 km/sem, día 8 km', () => {
    const t = computeTargets({
      coach: 'runner',
      sex: 'male',
      age: 35,
      weight_kg: 72,
      height_cm: 178,
      activity_pal: 1.55, // ignorado por runner (usa T_base + kcal_entreno)
      coach_params: { km_semana: 40, km_dia: 8 },
    });
    expect(t.bmr).toBe(1663);
    expect(t.kcal_target).toBe(2820);
    expect(t.protein_g).toBe(115); // 1.6 g/kg
    // guardrail de carbos: 40 km/sem exige ≥6 g/kg → baja grasa a 0.8 g/kg y sube carbos
    expect(t.fat_g).toBe(58); // 0.8 g/kg (bajada por guardrail)
    expect(t.carbs_g).toBe(460);
    expect(t.carbs_g).toBeGreaterThanOrEqual(6 * 72); // ≥ mínimo por volumen
  });

  it('HIPERTROFIA — hombre 24/68/175, moderado, novato (superávit + tope de ganancia)', () => {
    const t = computeTargets({
      coach: 'hipertrofia',
      sex: 'male',
      age: 24,
      weight_kg: 68,
      height_cm: 175,
      activity_pal: 1.55,
      coach_params: { experiencia: 'novato' },
    });
    expect(t.protein_g).toBe(136); // 2.0 g/kg
    expect(t.fat_g).toBe(61); // 0.9 g/kg
    // superávit POSITIVO pero CAPADO por ritmo de ganancia (novato 0.5%/sem):
    expect(t.kcal_target).toBeGreaterThan(t.tdee);
    expect(t.kcal_target).toBeLessThanOrEqual(Math.round(t.tdee * 1.15));
    expect(t.carbs_g).toBeGreaterThan(0);
    // NOTA: con novato=+15% y tope de ganancia el motor da ~2945 kcal; la línea de sanity
    // del doc (~2880) parece asumir +12%. Discrepancia reportada a Karpathy para R1.
  });

  it('BIENESTAR — mantenimiento (sin déficit)', () => {
    const t = computeTargets({
      coach: 'bienestar',
      sex: 'female',
      age: 40,
      weight_kg: 65,
      height_cm: 168,
      activity_pal: 1.375,
      coach_params: {},
    });
    expect(t.kcal_target).toBe(t.tdee); // = mantenimiento (TDEE > piso)
    expect(t.protein_g).toBe(91); // 1.4 * 65
    expect(t.carbs_g).toBeGreaterThan(0);
  });
});

describe('Topes de seguridad (salud)', () => {
  it('piso de calorías por sexo domina cuando BMR·1.1 < piso', () => {
    // female pequeña: BMR·1.1 < 1200 → piso = 1200
    const t = computeTargets({
      coach: 'perdida_grasa',
      sex: 'female',
      age: 20,
      weight_kg: 42,
      height_cm: 148,
      activity_pal: 1.2,
      coach_params: { ritmo: 'moderado' },
    });
    expect(t.kcal_target).toBe(1200);
    expect(t.kcal_target).toBeGreaterThanOrEqual(Math.round(pisoKcal(t.bmr, 'female')));
  });

  it('aplicaTopesDeficit limita la pérdida a ≤1%/sem y nunca baja del piso', () => {
    // déficit exagerado → recorta al tope de 1%/sem y luego al piso
    const obj = aplicaTopesDeficit({
      objetivo: 1000,
      tdeeVal: 3000,
      bmrVal: 2000,
      sex: 'male',
      weightKg: 100,
      deficitDia: 2000, // 2000·7/7700 = 1.8 kg/sem >> 1% de 100 kg
    });
    // maxDeficitDia = 1%·100·7700/7 = 1100 → 3000-1100 = 1900; piso = max(2200,1500)=2200 → 2200
    expect(obj).toBe(2200);
  });

  it('macros nunca devuelve carbos negativos y marca warn', () => {
    const m = macros({ objetivoKcal: 500, weightKg: 100, proteinPerKg: 2.0, fatPerKg: 0.8 });
    expect(m.carbG).toBe(0);
    expect(m.carbG).toBeGreaterThanOrEqual(0);
    expect(m.warn).toBe(true);
  });

  it('macros normal: carbos = resto, sin warn', () => {
    const m = macros({ objetivoKcal: 2000, weightKg: 70, proteinPerKg: 1.6, fatPerKg: 0.9 });
    expect(m.warn).toBe(false);
    expect(m.carbG).toBeGreaterThan(0);
    expect(m.protG).toBe(112);
    expect(m.fatG).toBe(63);
  });

  it('clampa PAL inválido/fuera de rango y NUNCA produce NaN (robustez R2)', () => {
    for (const badPal of [undefined, null, NaN, 0, 5, -1, 'x']) {
      const t = computeTargets({
        coach: 'bienestar',
        sex: 'male',
        age: 30,
        weight_kg: 80,
        height_cm: 180,
        activity_pal: badPal,
      });
      expect(Number.isFinite(t.kcal_target)).toBe(true);
      expect(Number.isFinite(t.tdee)).toBe(true);
      expect(t.kcal_target).toBeGreaterThan(0);
    }
  });

  it('coach inválido lanza error', () => {
    expect(() => computeTargets({ coach: 'no_existe', sex: 'male', weight_kg: 70, height_cm: 175, age: 30, activity_pal: 1.55 })).toThrow();
  });
});
