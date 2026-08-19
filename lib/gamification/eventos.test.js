import { describe, it, expect } from 'vitest';
import {
  EVENTOS, xpDe, claveDedupe, claveCanonica, nivelDe, logrosDe, logroMeta,
  pisoSeguridad, enRangoKcal, underEating, proteinaEnMeta, permiteOtorgar,
} from './eventos.js';

describe('gamificación · XP y clave-dedupe', () => {
  it('xpDe usa la config (§3); tipo desconocido → 0', () => {
    expect(xpDe(EVENTOS.MEAL_LOGGED)).toBe(10);
    expect(xpDe(EVENTOS.LESSON_COMPLETED)).toBe(25);
    expect(xpDe(EVENTOS.WEEKLY_CONSISTENT)).toBe(100);
    expect(xpDe('NO_EXISTE')).toBe(0);
  });
  it('claveDedupe es determinista por tipo (anti-doble-conteo)', () => {
    expect(claveDedupe(EVENTOS.MEAL_LOGGED, 42)).toBe('meal:42');
    expect(claveDedupe(EVENTOS.LESSON_COMPLETED, 'proteina')).toBe('leccion:proteina');
    expect(claveDedupe(EVENTOS.WORKOUT_LOGGED, '2026-08-17')).toBe('entreno:2026-08-17');
    expect(claveDedupe(EVENTOS.WEEKLY_CONSISTENT, '2026-W33')).toBe('semana:2026-W33');
  });

  // Slowking RESIDUAL: la clave canónica se deriva server-side de la ref validada, NO del raw del cliente.
  it('500 sufijos distintos sobre la MISMA comida real → UNA sola clave canónica (no farmeable)', () => {
    const claves = new Set();
    for (let i = 1; i <= 500; i += 1) claves.add(claveCanonica('MEAL_LOGGED', `meal:123:${i}`)); // sufijo basura del cliente
    expect(claves.size).toBe(1);
    expect([...claves][0]).toBe('MEAL_LOGGED:123'); // ← la comida 123, una vez
  });
  it('la canónica ignora el sufijo pero respeta la referencia real (dedupe correcto por unidad V1)', () => {
    expect(claveCanonica('MEAL_LOGGED', 'meal:123')).toBe('MEAL_LOGGED:123');       // 1/meal_id
    expect(claveCanonica('LESSON_COMPLETED', 'leccion:proteina')).toBe('LESSON_COMPLETED:proteina'); // 1/concepto
    expect(claveCanonica('WORKOUT_LOGGED', 'entreno:2026-08-19')).toBe('WORKOUT_LOGGED:2026-08-19');  // 1/día
    // dos comidas reales distintas → dos claves distintas (no sobre-dedupe)
    expect(claveCanonica('MEAL_LOGGED', 'meal:123')).not.toBe(claveCanonica('MEAL_LOGGED', 'meal:124'));
  });
});

describe('gamificación · niveles (renombrables, nivelDe puro)', () => {
  it('mapea xp → nivel + nombre + faltan al siguiente', () => {
    expect(nivelDe(0).nombre).toBe('Aprendiz');
    expect(nivelDe(0).n).toBe(1);
    expect(nivelDe(150).nombre).toBe('Constante');
    expect(nivelDe(500).nombre).toBe('Disciplinado');
    expect(nivelDe(9999).siguiente).toBeNull(); // tope
    const nv = nivelDe(100);
    expect(nv.siguiente.faltan).toBe(50); // 150 - 100
  });
});

describe('gamificación · logros (criterios de CONDUCTA, jamás peso)', () => {
  it('desbloquea por estado agregado', () => {
    expect(logrosDe({ dias_registrados: 1 })).toContain('primer_registro');
    expect(logrosDe({ racha: 7 })).toContain('racha_7');
    expect(logrosDe({ lecciones: 5 })).toContain('aprendiz_5');
    expect(logrosDe({ prot_meta_dias: 5 })).toContain('proteina_5');
    expect(logrosDe({})).toEqual([]);
  });
  it('los OCULTOS existen pero no se desbloquean sin cumplir', () => {
    expect(logroMeta('constancia_total').oculto).toBe(true);
    expect(logrosDe({ racha: 10 })).not.toContain('constancia_total'); // < 60
    expect(logrosDe({ racha: 60 })).toContain('constancia_total');
  });
});

describe('gamificación · GUARDIAS TCA (Karpathy §0/§5) — comer por debajo NUNCA da XP', () => {
  it('pisoSeguridad = max(BMR·1.1, 1500H/1200M); sin BMR → piso por sexo', () => {
    expect(pisoSeguridad(1500, 'male')).toBeCloseTo(1650, 5); // 1500*1.1
    expect(pisoSeguridad(1000, 'female')).toBe(1200); // 1000*1.1=1100 < 1200 → 1200
    expect(pisoSeguridad(null, 'female')).toBe(1200);
    expect(pisoSeguridad(null, 'male')).toBe(1500);
  });
  it('enRangoKcal = banda [0.85,1.15]·target Y ≥ piso (premia RANGO, no debajo)', () => {
    expect(enRangoKcal({ consumido: 2000, target: 2000, piso: 1500 })).toBe(true);
    expect(enRangoKcal({ consumido: 1650, target: 2000, piso: 1500 })).toBe(false); // 82.5% < 85%
    expect(enRangoKcal({ consumido: 1900, target: 2000, piso: 1950 })).toBe(false); // en banda pero < piso
  });
  it('underEating = < piso o < 70% de la meta', () => {
    expect(underEating({ consumido: 1200, target: 2000, piso: 1500 })).toBe(true); // < piso
    expect(underEating({ consumido: 1300, target: 2000, piso: 1000 })).toBe(true); // < 70% (1400)
    expect(underEating({ consumido: 1900, target: 2000, piso: 1500 })).toBe(false);
  });
  it('permiteOtorgar(GOAL_REACHED): under-eating → NUNCA; en rango → sí', () => {
    // under-eating: 0 XP aunque "cumplió" un objetivo de kcal
    expect(permiteOtorgar(EVENTOS.GOAL_REACHED, { consumido: 1200, target: 2000, piso: 1500 })).toBe(false);
    // en rango → premia
    expect(permiteOtorgar(EVENTOS.GOAL_REACHED, { consumido: 2000, target: 2000, piso: 1500 })).toBe(true);
    // eventos no-kcal siempre pasan la guardia
    expect(permiteOtorgar(EVENTOS.MEAL_LOGGED)).toBe(true);
    expect(permiteOtorgar(EVENTOS.LESSON_COMPLETED)).toBe(true);
  });
  it('proteinaEnMeta = aditivo (≥90% del target), no mira kcal', () => {
    expect(proteinaEnMeta({ prot: 108, protTarget: 120 })).toBe(true); // 90%
    expect(proteinaEnMeta({ prot: 100, protTarget: 120 })).toBe(false); // 83%
  });
});
