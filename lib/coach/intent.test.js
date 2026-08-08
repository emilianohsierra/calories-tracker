import { describe, it, expect } from 'vitest';
import { intentListaCompras, intentArmarLista, extraerItemsLista } from './intent.js';

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

describe('intentArmarLista · "arma mi lista del súper" → construcción determinista (no briefing)', () => {
  it('DISPARA con el repro de Emiliano y variantes', () => {
    expect(intentArmarLista('Arma mi lista del súper para esta semana')).toBe(true); // repro
    expect(intentArmarLista('hazme la lista de compras')).toBe(true);
    expect(intentArmarLista('genera mi lista del mandado')).toBe(true);
    expect(intentArmarLista('prepárame la lista de la despensa')).toBe(true);
  });
  it('NO colisiona: "arma un plan" (sin lista) → false; item puntual va por intentListaCompras', () => {
    expect(intentArmarLista('arma un plan de entrenamiento')).toBe(false);
    expect(intentArmarLista('anota que necesito leche')).toBe(false); // eso es "anotar", no "armar"
    expect(intentListaCompras('arma mi lista del súper')).toBe(false); // "armar" ≠ "anotar" (rutas distintas)
  });
});

describe('extraerItemsLista · extrae el producto sin depender del modelo', () => {
  it('repro exacto y variantes → item limpio (sin verbo ni "a la lista")', () => {
    expect(extraerItemsLista('Anota que necesito leche')).toEqual(['leche']); // repro
    expect(extraerItemsLista('apúntame el arroz')).toEqual(['arroz']);
    expect(extraerItemsLista('agrégame leche a la lista')).toEqual(['leche']);
    expect(extraerItemsLista('necesito comprar huevo')).toEqual(['huevo']);
    expect(extraerItemsLista('pon leche en el súper')).toEqual(['leche']);
  });
  it('varios ítems por conector', () => {
    expect(extraerItemsLista('anota leche y huevo')).toEqual(['leche', 'huevo']);
    expect(extraerItemsLista('necesito comprar pan, tortillas y frijoles')).toEqual(['pan', 'tortillas', 'frijoles']);
  });
  it('sin ítem claro → [] (el route cae al tool-loop normal)', () => {
    expect(extraerItemsLista('anota')).toEqual([]);
    expect(extraerItemsLista('')).toEqual([]);
  });
});
