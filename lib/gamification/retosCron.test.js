import { describe, it, expect } from 'vitest';
import {
  RETO_XP, xpDeReto, diaDelAno, semanaISO, seedSemanal, retosActivosDe, claveReto,
  progresoEventos, progresoMetrica, diasEnRango, diasProteina,
} from './retosCron.js';

describe('retosCron · helpers deterministas (S1)', () => {
  it('semanaISO: formato YYYY-Www y semana ISO correcta', () => {
    expect(semanaISO('2026-08-20')).toMatch(/^\d{4}-W\d{2}$/);
    // 2026-01-01 es jueves → semana ISO 01 del 2026.
    expect(semanaISO('2026-01-01')).toBe('2026-W01');
    // Un lunes y el domingo de su misma semana comparten periodo.
    expect(semanaISO('2026-08-17')).toBe(semanaISO('2026-08-23'));
    // El lunes siguiente cambia de semana.
    expect(semanaISO('2026-08-24')).not.toBe(semanaISO('2026-08-23'));
  });

  it('seedSemanal: estable dentro de la semana, cambia entre semanas', () => {
    expect(seedSemanal('2026-08-17')).toBe(seedSemanal('2026-08-23'));
    expect(seedSemanal('2026-08-24')).not.toBe(seedSemanal('2026-08-17'));
  });

  it('diaDelAno: índice creciente y distinto por día', () => {
    expect(diaDelAno('2026-01-01')).toBe(1);
    expect(diaDelAno('2026-01-02')).toBe(diaDelAno('2026-01-01') + 1);
  });

  it('retosActivosDe: exactamente 1 diario (periodo=fecha) + 1 semanal (periodo=YYYY-Www), deterministas', () => {
    const a = retosActivosDe('2026-08-20');
    expect(a).toHaveLength(2);
    expect(a[0].periodo).toBe('2026-08-20');
    expect(a[1].periodo).toMatch(/^\d{4}-W\d{2}$/);
    // Determinista: misma fecha → mismos retos.
    expect(retosActivosDe('2026-08-20').map((x) => x.reto.id)).toEqual(a.map((x) => x.reto.id));
  });

  it('claveReto: CHALLENGE_COMPLETED:<id>@<periodo> (el @ mantiene id+periodo en el 2º campo por ":")', () => {
    const clave = claveReto({ id: 'reto_x' }, '2026-W34');
    expect(clave).toBe('CHALLENGE_COMPLETED:reto_x@2026-W34');
    // split_part(clave, ':', 2) → 'reto_x@2026-W34' (único por periodo).
    expect(clave.split(':')[1]).toBe('reto_x@2026-W34');
    // Distinto periodo → distinta clave (un semanal se premia cada semana).
    expect(claveReto({ id: 'reto_x' }, '2026-W35')).not.toBe(clave);
  });

  it('xpDeReto: 20 diario / 60 semanal / 0 desconocido', () => {
    expect(RETO_XP).toEqual({ diario: 20, semanal: 60 });
    expect(xpDeReto({ periodo: 'diario' })).toBe(20);
    expect(xpDeReto({ periodo: 'semanal' })).toBe(60);
    expect(xpDeReto({ periodo: 'otro' })).toBe(0);
    expect(xpDeReto(null)).toBe(0);
  });

  it('progresoEventos: cuenta DÍAS distintos, tope en meta', () => {
    expect(progresoEventos({ meta: 3 }, ['2026-08-18', '2026-08-18', '2026-08-19'])).toBe(2);
    expect(progresoEventos({ meta: 2 }, ['a', 'b', 'c', 'd'])).toBe(2); // tope
    expect(progresoEventos({ meta: 3 }, [])).toBe(0);
  });

  it('progresoMetrica: tope en meta, no negativo', () => {
    expect(progresoMetrica({ meta: 5 }, 3)).toBe(3);
    expect(progresoMetrica({ meta: 5 }, 9)).toBe(5);
    expect(progresoMetrica({ meta: 5 }, undefined)).toBe(0);
  });

  it('diasEnRango: cuenta días TCA-safe (>= piso y en rango kcal)', () => {
    // Con target 2000 y piso derivado del bmr, un día en ~2000 kcal cuenta; uno muy bajo (500) no.
    const porDia = { d1: { kcal: 2000, prot: 0 }, d2: { kcal: 500, prot: 0 } };
    const n = diasEnRango(porDia, { kcalTarget: 2000, bmr: 1500, sexo: 'M' });
    expect(n).toBe(1);
  });

  it('diasProteina: cuenta días con proteína en meta', () => {
    const porDia = { d1: { kcal: 0, prot: 130 }, d2: { kcal: 0, prot: 40 } };
    const n = diasProteina(porDia, { protTarget: 120 });
    expect(n).toBe(1);
  });
});
