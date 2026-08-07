import { describe, it, expect } from 'vitest';
import { intentListaCompras } from './intent.js';

describe('intentListaCompras · fuerza la tool cuando la persona pide anotar/comprar', () => {
  it('DISPARA con el repro exacto y variantes', () => {
    expect(intentListaCompras('Anota que necesito leche')).toBe(true); // repro de Emiliano
    expect(intentListaCompras('apúntame el arroz')).toBe(true);
    expect(intentListaCompras('agrégame leche a la lista')).toBe(true);
    expect(intentListaCompras('necesito comprar huevo')).toBe(true);
    expect(intentListaCompras('pon leche en la lista')).toBe(true);
    expect(intentListaCompras('añade atún a mi súper')).toBe(true);
    expect(intentListaCompras('hay que comprar pan')).toBe(true);
    expect(intentListaCompras('ANOTA QUE NECESITO LECHE')).toBe(true); // mayúsculas
  });

  it('NO dispara con intenciones que no son de lista (sin falsos positivos comunes)', () => {
    expect(intentListaCompras('¿qué puedo comer?')).toBe(false);
    expect(intentListaCompras('me gusta la leche')).toBe(false);
    expect(intentListaCompras('necesito más proteína hoy')).toBe(false);
    expect(intentListaCompras('registra que comí pollo')).toBe(false);
    expect(intentListaCompras('¿con qué sustituyo mi refresco?')).toBe(false);
    expect(intentListaCompras('')).toBe(false);
    expect(intentListaCompras(null)).toBe(false);
  });
});
