import { describe, it, expect } from 'vitest';
import { quePuedoComer } from './suggest';

// Blindaje del motor "¿qué puedo comer?" (determinista). Reusa findViolations (alérgenos).

// Helpers de despensa (nutrición por_100g con porción = fila real de products).
const pollo = { pantry_item_id: 'p1', nombre: 'Pechuga de pollo', cantidad: 2, unidad: 'porcion', ingredientes: ['pollo'], nutricion: { base: 'por_100g', porcion_g: 150, kcal: 165, proteina_g: 31, carbs_g: 0, grasa_g: 3.6, fibra_g: 0, procedencia: 'verificado' } };
const arroz = { pantry_item_id: 'p2', nombre: 'Arroz', cantidad: 3, unidad: 'porcion', ingredientes: ['arroz'], nutricion: { base: 'por_porcion', porcion_g: 158, kcal: 205, prot: 4, carb: 45, gras: 0.4, fibra: 1, procedencia: 'verificado' } };
const brocoli = { pantry_item_id: 'p3', nombre: 'Brócoli', cantidad: 1, unidad: 'porcion', ingredientes: ['brocoli'], nutricion: { base: 'por_100g', porcion_g: 100, kcal: 34, proteina_g: 2.8, carbs_g: 7, grasa_g: 0.4, fibra_g: 2.6, procedencia: 'verificado' } };
const nuez = { pantry_item_id: 'p4', nombre: 'Nueces', cantidad: 1, unidad: 'porcion', ingredientes: ['nuez'], nutricion: { base: 'por_100g', porcion_g: 30, kcal: 654, proteina_g: 15, carbs_g: 14, grasa_g: 65, fibra_g: 7, procedencia: 'verificado' } };

const pendientes = { kcal: 600, prot: 50, carb: 60, fat: 20 };

describe('quePuedoComer — determinismo y forma', () => {
  it('devuelve ≤3 opciones con la forma que consume MealSuggestionCard', () => {
    const ops = quePuedoComer(pendientes, [pollo, arroz, brocoli], 'perdida_grasa');
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.length).toBeLessThanOrEqual(3);
    const o = ops[0];
    expect(o).toHaveProperty('items');
    expect(o.items[0]).toHaveProperty('pantry_item_id');
    expect(o.items[0]).toHaveProperty('cantidad');
    expect(typeof o.titulo).toBe('string');
    expect(typeof o.kcal).toBe('number');
    expect(o.macros).toHaveProperty('prot');
    expect(o.usa_n_despensa).toBe(o.items.length);
    expect(['verificado', 'introducido', 'estimado']).toContain(o.procedencia);
  });

  it('los NÚMEROS salen de la suma de productos (pollo 150g + arroz = 453 kcal / 51 P)', () => {
    const ops = quePuedoComer({ kcal: 500, prot: 55 }, [pollo, arroz], 'hipertrofia');
    const combo = ops.find((o) => o.usa_n_despensa === 2);
    // pollo por_100g×150g = 247.5 kcal / 46.5 P  +  arroz por_porcion = 205 kcal / 4 P
    expect(combo.kcal).toBe(453); // round(452.5)
    expect(combo.macros.prot).toBe(51); // round(50.5)
  });

  it('mismo input → mismo output (determinista)', () => {
    const a = quePuedoComer(pendientes, [pollo, arroz, brocoli], 'runner');
    const b = quePuedoComer(pendientes, [pollo, arroz, brocoli], 'runner');
    expect(a).toEqual(b);
  });
});

describe('quePuedoComer — factibilidad', () => {
  it('excluye ítems caducados (opts.hoy)', () => {
    const vencido = { ...arroz, pantry_item_id: 'v', caduca_en: '2020-01-01' };
    const ops = quePuedoComer(pendientes, [pollo, vencido], 'bienestar', [], { hoy: '2026-07-31' });
    const ids = ops.flatMap((o) => o.items.map((i) => i.pantry_item_id));
    expect(ids).not.toContain('v');
  });

  it('excluye ítems sin cantidad', () => {
    const vacio = { ...brocoli, pantry_item_id: 'z', cantidad: 0 };
    const ops = quePuedoComer(pendientes, [pollo, vacio], 'bienestar');
    const ids = ops.flatMap((o) => o.items.map((i) => i.pantry_item_id));
    expect(ids).not.toContain('z');
  });

  it('FILTRO DE ALÉRGENOS: con alergia al pollo, ninguna opción lo contiene', () => {
    const ops = quePuedoComer(pendientes, [pollo, arroz, brocoli], 'perdida_grasa', ['pollo']);
    const ids = ops.flatMap((o) => o.items.map((i) => i.pantry_item_id));
    expect(ids).not.toContain('p1');
    expect(ids.length).toBeGreaterThan(0); // arroz/brócoli siguen disponibles
  });

  it('despensa vacía o toda insegura → []', () => {
    expect(quePuedoComer(pendientes, [], 'bienestar')).toEqual([]);
    expect(quePuedoComer(pendientes, [pollo], 'bienestar', ['pollo'])).toEqual([]);
  });
});

describe('quePuedoComer — ranking por objetivo', () => {
  it('perdida_grasa prioriza proteína/saciedad sobre alta densidad (nuez queda al final)', () => {
    const ops = quePuedoComer({ kcal: 500, prot: 45 }, [pollo, arroz, nuez], 'perdida_grasa', [], { max: 3 });
    // La mejor opción no debería ser la de solo-nuez (muy densa, poca proteína/kcal).
    const soloNuez = ops.findIndex((o) => o.items.length === 1 && o.items[0].pantry_item_id === 'p4');
    const conPollo = ops.findIndex((o) => o.items.some((i) => i.pantry_item_id === 'p1'));
    expect(conPollo).toBeGreaterThanOrEqual(0);
    if (soloNuez >= 0) expect(conPollo).toBeLessThan(soloNuez);
  });

  it('hipertrofia rankea arriba una opción rica en proteína', () => {
    const ops = quePuedoComer({ kcal: 700, prot: 60 }, [pollo, arroz, brocoli], 'hipertrofia');
    expect(ops[0].macros.prot).toBeGreaterThanOrEqual(ops[ops.length - 1].macros.prot);
  });
});
