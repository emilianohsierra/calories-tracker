import { describe, it, expect } from 'vitest';
import { objetivosDelDia, siguienteAccion, progresoDia } from './dia.js';

describe('gamificación · objetivo del día + siguiente mejor acción (§22/§23, del estado real)', () => {
  it('objetivos ADITIVOS con `hecho` del estado; registrar por defecto', () => {
    const objs = objetivosDelDia({ n_comidas: 0, prot: 40, protTarget: 120, agua: 500, aguaMeta: 2000, leccionHoy: false });
    const byId = Object.fromEntries(objs.map((o) => [o.id, o]));
    expect(byId.registrar.hecho).toBe(false);
    expect(byId.proteina.hecho).toBe(false); // 40 < 108 (90% de 120)
    expect(byId.agua.hecho).toBe(false);
    expect(byId.aprender.hecho).toBe(false);
    // ninguno menciona "comer menos" (aditivos)
    for (const o of objs) expect(o.label.toLowerCase()).not.toMatch(/menos|deficit|saltar|bajar/);
  });
  it('marca hecho cuando el estado lo cumple', () => {
    const objs = objetivosDelDia({ n_comidas: 2, prot: 120, protTarget: 120, agua: 2100, aguaMeta: 2000, leccionHoy: true });
    for (const o of objs) expect(o.hecho).toBe(true);
  });
  it('sin metas de proteína/agua → esos objetivos se omiten (no inventa)', () => {
    const ids = objetivosDelDia({ n_comidas: 1 }).map((o) => o.id);
    expect(ids).toContain('registrar');
    expect(ids).toContain('aprender');
    expect(ids).not.toContain('proteina');
    expect(ids).not.toContain('agua');
  });
  it('siguienteAccion = primer pendiente; día completo → null', () => {
    const pend = siguienteAccion([{ id: 'registrar', label: 'Registra', hecho: false, accion: 'registrar' }]);
    expect(pend.cta.accion).toBe('registrar');
    expect(siguienteAccion([{ id: 'x', label: 'y', hecho: true }])).toBeNull();
  });
  it('progresoDia cuenta hechas/total', () => {
    expect(progresoDia([{ hecho: true }, { hecho: false }, { hecho: true }])).toEqual({ hechas: 2, total: 3 });
  });
});
