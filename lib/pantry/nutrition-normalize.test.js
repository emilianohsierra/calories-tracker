import { describe, it, expect } from 'vitest';
import { toCanonical, perServing, nutriScore, novaGroup } from './nutrition-normalize.js';

describe('nutrition-normalize · toCanonical (alias multi-fuente → canónico por-100g)', () => {
  it('mapea alias de OFF (energy-kcal_100g, proteins_100g, sodium_100g g→mg, trans/sat)', () => {
    const c = toCanonical({
      'energy-kcal_100g': 100, proteins_100g: 5, carbohydrates_100g: 10, fat_100g: 2,
      'saturated-fat_100g': 1, 'trans-fat_100g': 0.5, fiber_100g: 3, sugars_100g: 4, sodium_100g: 0.3,
    });
    expect(c).toMatchObject({
      calories_per_100g: 100, protein_g: 5, carbs_g: 10, fat_g: 2,
      saturated_fat_g: 1, trans_fat_g: 0.5, fiber_g: 3, sugars_g: 4, sodium_mg: 300,
    });
  });
  it('mapea alias internos (kcal/prot/sodio_mg/azucar) y genéricos (calories/protein_g)', () => {
    expect(toCanonical({ kcal: 120, prot: 6, sodio_mg: 200, azucar: 5 })).toMatchObject({ calories_per_100g: 120, protein_g: 6, sodium_mg: 200, sugars_g: 5 });
    expect(toCanonical({ calories: 90, protein_g: 3 })).toMatchObject({ calories_per_100g: 90, protein_g: 3 });
  });
  it('convierte energía en kJ a kcal si falta kcal directo', () => {
    expect(toCanonical({ energy_100g: 418.4 }).calories_per_100g).toBe(100); // 418.4/4.184
  });
  it('ausente = null (NADA de invención)', () => {
    const c = toCanonical({ proteins_100g: 5 });
    expect(c.protein_g).toBe(5);
    expect(c.calories_per_100g).toBe(null);
    expect(c.sodium_mg).toBe(null);
    expect(toCanonical(null).protein_g).toBe(null);
  });
  it('valor NEGATIVO → null (dato inválido, no fabrica; Slowking H3)', () => {
    const c = toCanonical({ 'energy-kcal_100g': -50, proteins_100g: 5, fat_100g: -1 });
    expect(c.calories_per_100g).toBe(null);
    expect(c.fat_g).toBe(null);
    expect(c.protein_g).toBe(5);
  });
});

describe('nutrition-normalize · perServing (escala por porción)', () => {
  it('escala del canónico por-100g a la porción en gramos', () => {
    const s = perServing({ calories_per_100g: 100, protein_g: 10, sodium_mg: 200, fat_g: null }, 30);
    expect(s.calories_per_100g).toBe(30);
    expect(s.protein_g).toBe(3);
    expect(s.sodium_mg).toBe(60);
    expect(s.fat_g).toBe(null); // null se mantiene null
  });
  it('sin porción válida → null (no inventa)', () => {
    expect(perServing({ calories_per_100g: 100 }, 0)).toBe(null);
    expect(perServing({ calories_per_100g: 100 }, null)).toBe(null);
    expect(perServing(null, 30)).toBe(null);
  });
});

describe('nutrition-normalize · nutriScore / novaGroup', () => {
  it('nutriScore normaliza a a..e o null', () => {
    expect(nutriScore('A')).toBe('a');
    expect(nutriScore('d')).toBe('d');
    expect(nutriScore('unknown')).toBe(null);
    expect(nutriScore('not-applicable')).toBe(null);
    expect(nutriScore(null)).toBe(null);
  });
  it('novaGroup normaliza a 1..4 o null', () => {
    expect(novaGroup(4)).toBe(4);
    expect(novaGroup('2')).toBe(2);
    expect(novaGroup(7)).toBe(null);
    expect(novaGroup(null)).toBe(null);
  });
});
