import { describe, it, expect } from 'vitest';
import { normalizeEtiqueta, LEER_ETIQUETA_TOOL } from './label';

// Blindaje de la normalización de etiqueta (parte PURA; la visión es IO).

describe('normalizeEtiqueta', () => {
  it('mapea los campos y marca procedencia estimado_ia (sin confirmar)', () => {
    const r = normalizeEtiqueta({ es_etiqueta: true, base: 'por_porcion', porcion_g: 30, kcal: 120, prot: 8, carb: 14, gras: 3, fibra: 2, azucar: 5, sodio_mg: 150 });
    expect(r).toMatchObject({ base: 'por_porcion', porcion_g: 30, kcal: 120, prot: 8, carb: 14, gras: 3, fibra: 2, azucar: 5, sodio_mg: 150 });
    expect(r.procedencia).toBe('estimado_ia');
    expect(r.confirmado).toBe(false);
  });

  it('si no es etiqueta → null', () => {
    expect(normalizeEtiqueta({ es_etiqueta: false, kcal: 999 })).toBeNull();
    expect(normalizeEtiqueta(null)).toBeNull();
  });

  it('base inválida cae a por_100g; negativos → 0; redondea', () => {
    const r = normalizeEtiqueta({ es_etiqueta: true, base: 'raro', porcion_g: -5, kcal: 250.7, prot: -1, carb: 30.4, gras: 9.9, fibra: 0, azucar: 0, sodio_mg: 0 });
    expect(r.base).toBe('por_100g');
    expect(r.porcion_g).toBe(0);
    expect(r.kcal).toBe(251);
    expect(r.prot).toBe(0);
    expect(r.carb).toBe(30);
  });
});

describe('LEER_ETIQUETA_TOOL', () => {
  it('schema válido con todos los campos required (strict-friendly)', () => {
    expect(LEER_ETIQUETA_TOOL.name).toBe('leer_etiqueta');
    expect(LEER_ETIQUETA_TOOL.input_schema.additionalProperties).toBe(false);
    expect(LEER_ETIQUETA_TOOL.input_schema.required).toEqual(
      expect.arrayContaining(['es_etiqueta', 'base', 'porcion_g', 'kcal', 'prot', 'carb', 'gras', 'fibra', 'azucar', 'sodio_mg'])
    );
  });
});
