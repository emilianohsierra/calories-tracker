import { describe, it, expect } from 'vitest';
import { seleccionarPlatillos, PLATILLOS_MX } from './platillos.js';

describe('platillos · catálogo (config versionada, honesto)', () => {
  it('tiene ~17 platillos con rangos [min,max] + ingredientes para el cinturón', () => {
    expect(PLATILLOS_MX.length).toBeGreaterThanOrEqual(15);
    for (const p of PLATILLOS_MX) {
      expect(Array.isArray(p.kcal) && p.kcal.length === 2).toBe(true);
      expect(p.kcal[0]).toBeLessThanOrEqual(p.kcal[1]);
      expect(Array.isArray(p.ingredientes) && p.ingredientes.length).toBeTruthy();
    }
  });
});

describe('platillos · seleccionarPlatillos (determinista, macros restantes)', () => {
  it('faltando proteína alta → prioriza alto_proteina; cifras aproximadas + shape', () => {
    const out = seleccionarPlatillos({ kcal: 500, prot: 40, carb: 30, gras: 15 }, 'hipertrofia', [], { max: 3 });
    expect(out.length).toBeGreaterThan(0);
    const top = out[0];
    expect(top.estimado).toBe(true);
    expect(top.procedencia).toBe('aproximado');
    expect(top.rangos.kcal.length).toBe(2); // rango honesto "~"
    expect(top.porque).toBeTruthy();
    expect(top.cuadre).toHaveProperty('protPct');
    // el top debe ser un platillo con proteína relevante
    expect(top.macros.prot).toBeGreaterThanOrEqual(12);
  });
  it('runner con carbos pendientes → aparece un alto_carbo con razón de entreno', () => {
    const out = seleccionarPlatillos({ kcal: 600, prot: 10, carb: 80, gras: 10 }, 'runner', [], { max: 5 });
    const carbo = out.find((o) => o.tags.includes('alto_carbo'));
    expect(carbo).toBeTruthy();
    expect(out.some((o) => /entreno|energ/i.test(o.porque))).toBe(true);
  });
  it('descarta platillos que revientan >140% de kcal pendientes', () => {
    const out = seleccionarPlatillos({ kcal: 150, prot: 10, carb: 10, gras: 5 }, 'bienestar', [], { max: 10 });
    // comida_corrida (~750 mid) y chilaquiles (~475) revientan 150*1.4=210 → fuera
    expect(out.some((o) => o.id === 'comida_corrida')).toBe(false);
    expect(out.some((o) => o.id === 'chilaquiles')).toBe(false);
  });
  it('sin pendiente de kcal → no filtra por overshoot (igual devuelve opciones)', () => {
    const out = seleccionarPlatillos({ kcal: 0, prot: 30, carb: 0, gras: 0 }, 'hipertrofia', [], { max: 3 });
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('platillos · cinturón de alérgenos (SOLO SEGURO)', () => {
  it('alérgico al huevo → NUNCA sugiere huevos/chilaquiles/ensalada de atún (mayonesa)', () => {
    const out = seleccionarPlatillos({ kcal: 500, prot: 30, carb: 30, gras: 15 }, 'bienestar', ['huevo'], { max: 17 });
    const ids = out.map((o) => o.id);
    expect(ids).not.toContain('huevos');
    expect(ids).not.toContain('chilaquiles');
    expect(ids).not.toContain('ensalada_atun'); // lleva mayonesa/huevo
  });
  it('alérgico a lácteos → sin quesadilla / yogur / avena con leche', () => {
    const out = seleccionarPlatillos({ kcal: 600, prot: 20, carb: 60, gras: 15 }, 'bienestar', ['leche'], { max: 17 });
    const ids = out.map((o) => o.id);
    expect(ids).not.toContain('quesadilla');
    expect(ids).not.toContain('yogur_griego');
    expect(ids).not.toContain('avena_leche');
    // pero SÍ puede seguir sugiriendo seguros (frijol/arroz/pollo…)
    expect(out.length).toBeGreaterThan(0);
  });
  it('alérgico a pescado → sin atún ni ensalada de atún', () => {
    const out = seleccionarPlatillos({ kcal: 400, prot: 30, carb: 10, gras: 10 }, 'bienestar', ['pescado'], { max: 17 });
    const ids = out.map((o) => o.id);
    expect(ids).not.toContain('atun_agua');
    expect(ids).not.toContain('ensalada_atun');
  });

  // Slowking BLOQUEANTE (anafiláctico): contenido NO verificable (tag 'variable', ingredientes genéricos)
  // NUNCA a quien tiene restricciones — los genéricos burlan el cinturón léxico y darían SEGURO falso.
  it('comida_corrida (variable/genérica) NO se recomienda a NINGÚN alérgico (repro Slowking)', () => {
    const grande = { kcal: 2000, prot: 120, carb: 200, gras: 60 };
    for (const alergia of ['mani', 'leche', 'gluten', 'huevo', 'ajonjoli']) {
      const ids = seleccionarPlatillos(grande, 'bienestar', [alergia], { max: 20 }).map((o) => o.id);
      expect(ids, `alergia ${alergia} NO debe incluir comida_corrida`).not.toContain('comida_corrida');
    }
  });
  it('SIN restricciones → comida_corrida SÍ puede aparecer (no sobre-excluir)', () => {
    const ids = seleccionarPlatillos({ kcal: 2000, prot: 120, carb: 200, gras: 60 }, 'bienestar', [], { max: 20 }).map((o) => o.id);
    expect(ids).toContain('comida_corrida');
  });
});

describe('platillos · TCA-safe (añadir-no-restringir, cero peso/culpa)', () => {
  it('ninguna razón contiene términos de restricción/peso/culpa', () => {
    const PROH = ['come menos', 'para bajar', 'baja de peso', 'saltate', 'sáltate', 'quita', 'culpa', 'bascula', 'báscula', 'te pasaste', 'prohibido'];
    for (const obj of ['perdida_grasa', 'hipertrofia', 'runner', 'recomposicion', 'bienestar']) {
      const out = seleccionarPlatillos({ kcal: 500, prot: 35, carb: 40, gras: 15 }, obj, [], { max: 17 });
      for (const o of out) {
        const low = o.porque.toLowerCase();
        for (const p of PROH) expect(low.includes(p), `${obj}/${o.id} razón contiene "${p}": ${o.porque}`).toBe(false);
      }
    }
  });
});
