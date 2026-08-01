import { describe, it, expect } from 'vitest';
import { buildCoachLine, getHomeBriefing } from './briefing';

// buildCoachLine es PURA → test directo. getHomeBriefing usa un supabase FALSO (sin red).
// Nombres de campo = contrato de la UI de Rams (protein_g/carbs_g/fat_g).

describe('buildCoachLine (determinista, sin IA)', () => {
  it('sin metas → invita a completar el perfil', () => {
    expect(buildCoachLine({ objetivo: null, consumido: {} })).toMatch(/completa tu perfil/i);
  });

  it('prioriza el pendiente de proteína con números del motor', () => {
    const line = buildCoachLine({
      objetivo: { kcal: 1560, protein_g: 119 },
      consumido: { kcal: 800, protein_g: 48 },
    });
    expect(line).toBe('Proteína: llevas 48 de 119 g. Te faltan 71 g.');
  });

  it('sin pendiente de proteína → informa kcal restantes', () => {
    const line = buildCoachLine({
      objetivo: { kcal: 2000, protein_g: 140 },
      consumido: { kcal: 1500, protein_g: 140 },
    });
    expect(line).toBe('Llevas 1500 de 2000 kcal hoy. Te quedan 500 kcal.');
  });

  it('por encima de la meta → lo dice sin regañar', () => {
    const line = buildCoachLine({
      objetivo: { kcal: 2000, protein_g: 140 },
      consumido: { kcal: 2200, protein_g: 140 },
    });
    expect(line).toBe('Vas 200 kcal por encima de tu meta de hoy.');
  });

  it('nunca lleva emojis', () => {
    const line = buildCoachLine({ objetivo: { kcal: 1560, protein_g: 119 }, consumido: { kcal: 0, protein_g: 0 } });
    expect(line).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

// --- supabase falso mínimo: .from().select().eq().eq().maybeSingle() y await directo ---
function makeBuilder(result) {
  const b = {
    select: () => b,
    eq: () => b,
    maybeSingle: () => Promise.resolve(result),
    then: (res, rej) => Promise.resolve(result).then(res, rej), // awaitable (para meals)
  };
  return b;
}
function fakeSupabase(byTable) {
  return { from: (t) => makeBuilder(byTable[t] ?? { data: null }) };
}

describe('getHomeBriefing(supabase, userId) — contrato de la UI', () => {
  it('devuelve EXACTO { entrenoDelDia, macrosObjetivo, macrosConsumidos, coachLine } (+ extras)', async () => {
    const supabase = fakeSupabase({
      nutrition_profiles: { data: { coach: 'perdida_grasa', sex: 'female', weight_kg: 70 } },
      nutrition_targets: { data: { kcal_target: 1560, protein_g: 140, carbs_g: 124, fat_g: 56, fiber_g: 22, water_ml: 2450 } },
      meals: { data: [{ calories: 500, protein_g: 30, carbs_g: 40, fat_g: 18 }, { calories: 300, protein_g: 18, carbs_g: 20, fat_g: 8 }] },
      coach_day_state: { data: null },
    });
    const b = await getHomeBriefing(supabase, 'u1');

    // Los 4 campos del contrato existen con nombres idénticos.
    expect(Object.keys(b)).toEqual(expect.arrayContaining(['entrenoDelDia', 'macrosObjetivo', 'macrosConsumidos', 'coachLine']));
    expect(b.macrosObjetivo).toMatchObject({ kcal: 1560, protein_g: 140, carbs_g: 124, fat_g: 56 });
    expect(b.macrosConsumidos).toEqual({ kcal: 800, protein_g: 48, carbs_g: 60, fat_g: 26 });
    expect(b.coachLine).toBe('Proteína: llevas 48 de 140 g. Te faltan 92 g.');
    expect(b.entrenoDelDia).toBeNull();
  });

  it('entrenoDelDia { title, when? } desde coach_day_state', async () => {
    const supabase = fakeSupabase({
      nutrition_profiles: { data: { coach: 'runner', sex: 'male', weight_kg: 72 } },
      nutrition_targets: { data: { kcal_target: 2800, protein_g: 115, carbs_g: 423, fat_g: 72, fiber_g: 39, water_ml: 2520 } },
      meals: { data: [] },
      coach_day_state: { data: { entreno_estado: 'pendiente', hora_comida: null } },
    });
    const b = await getHomeBriefing(supabase, 'u4');
    expect(b.entrenoDelDia).toEqual({ title: 'Entrenamiento de hoy' });
  });

  it('sin perfil/targets → macrosObjetivo null y coachLine de onboarding (no rompe)', async () => {
    const supabase = fakeSupabase({});
    const b = await getHomeBriefing(supabase, 'u2');
    expect(b.macrosObjetivo).toBeNull();
    expect(b.macrosConsumidos).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(b.coachLine).toMatch(/completa tu perfil/i);
  });

  it('sin nutrition_targets pero con perfil → recalcula con el motor (computeTargets)', async () => {
    const supabase = fakeSupabase({
      nutrition_profiles: { data: { coach: 'perdida_grasa', sex: 'female', age: 30, weight_kg: 70, height_cm: 165, activity_pal: 1.375, coach_params: { ritmo: 'moderado' } } },
      nutrition_targets: { data: null },
      meals: { data: [] },
      coach_day_state: { data: null },
    });
    const b = await getHomeBriefing(supabase, 'u3');
    expect(b.macrosObjetivo).not.toBeNull();
    expect(b.macrosObjetivo.protein_g).toBe(140);
    expect(b.macrosObjetivo.kcal).toBeGreaterThan(1500);
  });
});
