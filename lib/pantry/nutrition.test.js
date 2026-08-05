import { describe, it, expect } from 'vitest';
import { servingNutrition, scaleServing, sumNutrition, weakestProcedencia } from './nutrition';

// Blindaje de la SUMA de nutrición de la despensa (determinista, sin IA).

describe('servingNutrition', () => {
  it('por_100g con porcion_g escala por (porcion_g/100)', () => {
    const s = servingNutrition({ nutricion: { base: 'por_100g', porcion_g: 150, kcal: 100, proteina_g: 20, carbs_g: 0, grasa_g: 4, fibra_g: 2, procedencia: 'verificado' } });
    expect(s.kcal).toBeCloseTo(150, 5);
    expect(s.prot).toBeCloseTo(30, 5);
    expect(s.gramos).toBe(150);
    expect(s.procedencia).toBe('verificado');
  });

  it('por_porcion usa los valores tal cual (factor 1)', () => {
    const s = servingNutrition({ nutricion: { base: 'por_porcion', porcion_g: 158, kcal: 205, prot: 4, carb: 45, gras: 0.4, procedencia: 'introducido' } });
    expect(s.kcal).toBe(205);
    expect(s.carb).toBe(45);
    expect(s.procedencia).toBe('introducido');
  });

  it('por_100g SIN porcion_g asume 100 g y DEGRADA la procedencia a estimado', () => {
    const s = servingNutrition({ nutricion: { base: 'por_100g', kcal: 250, proteina_g: 10, procedencia: 'verificado' } });
    expect(s.kcal).toBe(250);
    expect(s.gramos).toBe(100);
    expect(s.procedencia).toBe('estimado'); // supuesto de porción → estimado
  });
});

describe('weakestProcedencia (eslabón más débil)', () => {
  it('si cualquiera es estimado, el agregado es estimado', () => {
    expect(weakestProcedencia(['verificado', 'introducido', 'estimado'])).toBe('estimado');
    expect(weakestProcedencia(['verificado', 'introducido'])).toBe('introducido');
    expect(weakestProcedencia(['verificado', 'verificado'])).toBe('verificado');
    expect(weakestProcedencia(['estimado_ia', 'verificado'])).toBe('estimado'); // estimado_ia agrega como estimado
    expect(weakestProcedencia([])).toBe('estimado');
  });
});

describe('sumNutrition', () => {
  it('suma y redondea; procedencia = mínima de las partes', () => {
    const a = scaleServing(servingNutrition({ nutricion: { base: 'por_100g', porcion_g: 100, kcal: 165, proteina_g: 31, carbs_g: 0, grasa_g: 3.6, fibra_g: 0, procedencia: 'verificado' } }), 1);
    const b = scaleServing(servingNutrition({ nutricion: { base: 'por_porcion', kcal: 205, prot: 4, carb: 45, gras: 0.4, fibra: 1, procedencia: 'introducido' } }), 1);
    const t = sumNutrition([a, b]);
    expect(t.kcal).toBe(370);
    expect(t.prot).toBe(35);
    expect(t.carb).toBe(45);
    expect(t.procedencia).toBe('introducido');
  });

  it('scaleServing multiplica por cantidad de porciones', () => {
    const s = scaleServing({ kcal: 100, prot: 10, carb: 5, gras: 2, fibra: 1, gramos: 100, procedencia: 'verificado' }, 2);
    expect(s.kcal).toBe(200);
    expect(s.prot).toBe(20);
    expect(s.gramos).toBe(200);
  });
});
