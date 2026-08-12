import { describe, it, expect } from 'vitest';
import { priorNivel, bandaRespuesta, agregarBandas, estimarNivel } from './nivel.js';
import { PREGUNTAS_NIVEL } from './curriculum.js';

const Qdeficit = PREGUNTAS_NIVEL.find((p) => p.id === 'deficit');

describe('nivel · priorNivel (conductual, determinista)', () => {
  it('sin perfil o sin onboarding → principiante', () => {
    expect(priorNivel(null)).toBe('principiante');
    expect(priorNivel({ onboarding_completed: false })).toBe('principiante');
  });
  it('objetivo avanzado (hipertrofia/runner/recomp) → intermedio', () => {
    expect(priorNivel({ coach: 'hipertrofia' })).toBe('intermedio');
  });
  it('default → basico', () => {
    expect(priorNivel({ coach: 'perdida_grasa' })).toBe('basico');
  });
});

describe('nivel · bandaRespuesta (rúbrica 0-3, señales de Karpathy)', () => {
  it('idea equivocada → 0', () => {
    expect(bandaRespuesta('es no comer nada', Qdeficit.senales)).toBe(0);
  });
  it('correcta simple → 1', () => {
    expect(bandaRespuesta('comer menos de lo que gastas', Qdeficit.senales)).toBe(1);
  });
  it('correcta con matiz → 2', () => {
    expect(bandaRespuesta('comer bajo tu mantenimiento cuidando la proteina', Qdeficit.senales)).toBe(2);
  });
  it('precisa/cuantifica → 3', () => {
    expect(bandaRespuesta('un deficit del 15 a 20% del TDEE', Qdeficit.senales)).toBe(3);
  });
  it('fix rúbrica: "como 2000 kcal" NO se clasifica avanzado por el substring "20"', () => {
    expect(bandaRespuesta('como unas 2000 kcal al dia', Qdeficit.senales)).not.toBe(3);
  });
  it('"no sé" / vacío → 0 (sin penalizar, solo bajo)', () => {
    expect(bandaRespuesta('no se', Qdeficit.senales)).toBe(0);
    expect(bandaRespuesta('', Qdeficit.senales)).toBe(0);
  });
});

describe('nivel · agregarBandas / estimarNivel (conservador)', () => {
  it('media redondeada hacia abajo (empate → banda menor)', () => {
    expect(agregarBandas([1, 2])).toBe('basico');   // floor(1.5)=1
    expect(agregarBandas([3, 3])).toBe('avanzado');
    expect(agregarBandas([0, 0])).toBe('principiante');
    expect(agregarBandas([])).toBeNull();
  });
  it('prioridad: rúbrica > autoSelect > prior', () => {
    expect(estimarNivel({ prior: 'principiante', autoSelect: 'avanzado', bandas: [2, 2] })).toBe('intermedio');
    expect(estimarNivel({ prior: 'principiante', autoSelect: 'intermedio', bandas: [] })).toBe('intermedio');
    expect(estimarNivel({ prior: 'basico', autoSelect: 'compruebame', bandas: [] })).toBe('basico');
  });
});
