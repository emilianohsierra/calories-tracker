import { describe, it, expect } from 'vitest';
import { COACH_REGISTRY, COACH_REGISTRY_IDS, ACTIVE_COACHES, getCoachMeta, isCoachActive, isMedicalCoach } from './registry';
import { COACH_IDS } from '../nutrition/coaches';

// Blindaje del registro de producto vs el motor. Aditivo: no debe divergir del motor vivo.

describe('COACH_REGISTRY', () => {
  it('los 5 coaches del motor están ACTIVOS', () => {
    expect(ACTIVE_COACHES.sort()).toEqual(['bienestar', 'hipertrofia', 'perdida_grasa', 'recomposicion', 'runner'].sort());
  });

  it('cada coach ACTIVO mapea a un engine que EXISTE en el motor (lib/nutrition/coaches.js)', () => {
    for (const id of ACTIVE_COACHES) {
      const engine = COACH_REGISTRY[id].engine;
      expect(engine, `engine de ${id}`).not.toBeNull();
      expect(COACH_IDS, `engine ${engine} debe existir en el motor`).toContain(engine);
    }
  });

  it('los coaches médicos NO tienen macros automáticos (engine null) y van deferred', () => {
    for (const id of COACH_REGISTRY_IDS) {
      if (isMedicalCoach(id)) {
        expect(COACH_REGISTRY[id].engine, `${id} médico no debe tener engine`).toBeNull();
        expect(COACH_REGISTRY[id].estado, `${id} médico debe ir deferred`).toBe('deferred');
      }
    }
  });

  it('todos los iconos son SLUGS (kebab-case), nunca emojis', () => {
    for (const id of COACH_REGISTRY_IDS) {
      expect(COACH_REGISTRY[id].icono, `icono de ${id}`).toMatch(/^[a-z][a-z-]*$/);
    }
  });

  it('cada entrada tiene id/nombre/icono/especialidad/gating/engine/estado', () => {
    for (const id of COACH_REGISTRY_IDS) {
      const c = COACH_REGISTRY[id];
      expect(c.id).toBe(id);
      expect(typeof c.nombre).toBe('string');
      expect(typeof c.especialidad).toBe('string');
      expect(['general', 'medico']).toContain(c.gating);
      expect(['activo', 'deferred']).toContain(c.estado);
    }
  });

  it('helpers', () => {
    expect(isCoachActive('runner')).toBe(true);
    expect(isCoachActive('diabetes')).toBe(false);
    expect(isMedicalCoach('diabetes')).toBe(true);
    expect(isMedicalCoach('runner')).toBe(false);
    expect(getCoachMeta('runner').nombre).toBe('Runner');
    expect(getCoachMeta('inexistente')).toBeNull();
  });
});
