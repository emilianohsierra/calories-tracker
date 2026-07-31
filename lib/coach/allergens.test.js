import { describe, it, expect } from 'vitest';
import { findViolations, isSafe, filterSafeOptions } from './allergens';

describe('filtro de alérgenos (seguridad)', () => {
  it('detecta el alérgeno directo y por sinónimo', () => {
    expect(findViolations(['queso', 'pollo'], ['lacteo'])).toEqual(['queso']);
    expect(findViolations(['cacahuate'], ['mani'])).toEqual(['cacahuate']);
    expect(findViolations(['pan integral', 'huevo'], ['gluten'])).toEqual(['pan integral']);
  });

  it('es seguro cuando no hay coincidencia', () => {
    expect(findViolations(['pollo', 'arroz', 'brócoli'], ['lacteo'])).toEqual([]);
    expect(isSafe(['pollo', 'arroz'], ['gluten', 'mani'])).toBe(true);
  });

  it('sin restricciones → todo seguro', () => {
    expect(findViolations(['queso', 'pan'], [])).toEqual([]);
    expect(isSafe(['queso'], [])).toBe(true);
  });

  it('ignora acentos y plurales', () => {
    expect(isSafe(['Camarones'], ['marisco'])).toBe(false); // camarón ∈ marisco
    expect(isSafe(['almendras'], ['nuez'])).toBe(false);
  });

  it('filterSafeOptions descarta las opciones con alérgeno', () => {
    const opts = [
      { titulo: 'Tacos de pollo', ingredientes: ['tortilla', 'pollo'] },
      { titulo: 'Quesadilla', ingredientes: ['tortilla', 'queso'] },
    ];
    const safe = filterSafeOptions(opts, ['lacteo']);
    expect(safe).toHaveLength(1);
    expect(safe[0].titulo).toBe('Tacos de pollo');
  });
});
