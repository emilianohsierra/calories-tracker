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

// Endurecimiento del filtro de salud (regla dura de seguridad): plurales, categorías,
// sinónimos y no-listados. Debe ser hermético (ningún falso negativo).
describe('filtro de alérgenos · endurecimiento (seguridad crítica)', () => {
  it('plurales: singulariza y detecta (nueces→nuez, mariscos→marisco)', () => {
    expect(isSafe(['nueces'], ['nuez'])).toBe(false);
    expect(isSafe(['nueces'], ['frutos secos'])).toBe(false);
    expect(isSafe(['camarones', 'pollo'], ['mariscos'])).toBe(false);
    expect(isSafe(['almendras'], ['frutos secos'])).toBe(false);
  });

  it('CATEGORÍAS: una restricción de categoría prohíbe todos sus miembros', () => {
    // frutos secos
    for (const ing of ['almendra', 'macadamia', 'pistache', 'avellana', 'pinon'])
      expect(isSafe([ing], ['frutos secos'])).toBe(false);
    // mariscos
    for (const ing of ['pulpo', 'camaron', 'cangrejo', 'almeja'])
      expect(isSafe([ing], ['mariscos'])).toBe(false);
    // lácteos
    for (const ing of ['queso', 'mantequilla', 'yogur', 'crema'])
      expect(isSafe([ing], ['lacteos'])).toBe(false);
    // pescados
    for (const ing of ['atun', 'salmon', 'tilapia'])
      expect(isSafe([ing], ['pescado'])).toBe(false);
    // gluten
    for (const ing of ['trigo', 'pan', 'pasta', 'cebada'])
      expect(isSafe([ing], ['gluten'])).toBe(false);
  });

  it('sinónimos activan la categoría (lactosa→lácteos, celiaquía→gluten)', () => {
    expect(isSafe(['queso'], ['lactosa'])).toBe(false);
    expect(isSafe(['pan'], ['celiaquia'])).toBe(false);
    expect(isSafe(['cacahuate'], ['maní'])).toBe(false);
  });

  it('acentos en la restricción y en el ingrediente', () => {
    expect(isSafe(['piñón'], ['frutos secos'])).toBe(false);
    expect(isSafe(['Atún'], ['pescados'])).toBe(false);
  });

  it('NO-listados: comida sin el alérgeno es segura (sin falsos positivos groseros)', () => {
    expect(isSafe(['pollo', 'arroz', 'manzana', 'brocoli'], ['frutos secos'])).toBe(true);
    expect(isSafe(['pollo', 'arroz'], ['mariscos', 'pescado'])).toBe(true);
    expect(isSafe(['lechuga', 'jitomate', 'aguacate'], ['lacteos', 'gluten'])).toBe(true);
  });

  it('múltiples restricciones a la vez', () => {
    const v = findViolations(['queso', 'nuez', 'pollo', 'camaron'], ['lacteos', 'frutos secos', 'mariscos']);
    expect(v).toContain('queso');
    expect(v).toContain('nuez');
    expect(v).toContain('camaron');
    expect(v).not.toContain('pollo');
  });
});
