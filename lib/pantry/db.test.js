import { describe, it, expect } from 'vitest';
import { toClientItem } from './db.js';
import { norm, cantidadValida } from './text.js';

describe('pantry/db · toClientItem (fila BD → shape del cliente)', () => {
  it('mapea la fila y normaliza campos', () => {
    const row = {
      id: 'it1', nombre: 'Avena', marca: 'Quaker', categoria: 'carbos', cantidad: '1200', unidad: 'g',
      caduca_el: '2026-09-01', nutricion: { base: 'por_100g', kcal: 389, prot: 13, carb: 66, gras: 7, procedencia: 'verificado' },
      confianza: 'verified', imagen: '',
    };
    const it = toClientItem(row);
    expect(it).toMatchObject({ id: 'it1', nombre: 'Avena', marca: 'Quaker', cantidad: 1200, unidad: 'g', confianza: 'verified' });
    expect(it.nutricion.kcal).toBe(389);
    expect(it.caduca_el).toBe('2026-09-01');
  });

  it('rellena defaults seguros (confianza inválida → user; nulls)', () => {
    const it = toClientItem({ id: 'x', nombre: 'Sal', cantidad: 1, confianza: 'bogus' });
    expect(it.confianza).toBe('user');
    expect(it.marca).toBe('');
    expect(it.nutricion).toBe(null);
    expect(it.caduca_el).toBe(null);
  });
});

describe('pantry/text', () => {
  it('norm quita acentos/puntuación y colapsa espacios', () => {
    expect(norm('  Piña   Colada!! ')).toBe('pina colada');
    expect(norm('Café con Leche')).toBe('cafe con leche');
  });
  it('cantidadValida acota a >=0 y redondea; null si inválida', () => {
    expect(cantidadValida('1200')).toBe(1200);
    expect(cantidadValida(2.3456)).toBe(2.346);
    expect(cantidadValida(-1)).toBe(null);
    expect(cantidadValida('abc')).toBe(null);
  });
});
