import { describe, it, expect, vi } from 'vitest';
import { parseVeredicto, juezEducacionIA } from './juezEducacionIA.js';

describe('juezEducacionIA · parseVeredicto (puro, fail-closed)', () => {
  it('parsea JSON válido', () => {
    expect(parseVeredicto('{"peligroso": false, "categoria": "ok"}')).toEqual({ peligroso: false, categoria: 'ok' });
    expect(parseVeredicto('{"peligroso": true, "categoria": "purga"}').peligroso).toBe(true);
  });
  it('extrae el JSON aunque venga con texto alrededor', () => {
    expect(parseVeredicto('Claro: {"peligroso": true, "categoria":"x"} listo').peligroso).toBe(true);
  });
  it('LANZA si no hay JSON', () => {
    expect(() => parseVeredicto('seguro')).toThrow();
  });
  it('LANZA si el JSON es inválido', () => {
    expect(() => parseVeredicto('{peligroso: no}')).toThrow();
  });
  it('LANZA si falta el booleano peligroso', () => {
    expect(() => parseVeredicto('{"categoria":"x"}')).toThrow();
    expect(() => parseVeredicto('{"peligroso":"true"}')).toThrow(); // string, no boolean
  });
});

const mkAnthropic = (text) => ({ messages: { create: vi.fn(async () => ({ content: [{ type: 'text', text }] })) } });

describe('juezEducacionIA · llamada (mock anthropic)', () => {
  it('devuelve el veredicto parseado', async () => {
    const anthropic = mkAnthropic('{"peligroso": false, "categoria": "neutro"}');
    await expect(juezEducacionIA({ anthropic, texto: 'La proteína sacia.' })).resolves.toEqual({ peligroso: false, categoria: 'neutro' });
    // el texto se envía envuelto en delimitadores (resistencia a inyección)
    expect(anthropic.messages.create.mock.calls[0][0].messages[0].content).toContain('<<<EVALUAR>>>');
    expect(anthropic.messages.create.mock.calls[0][0].temperature).toBe(0);
  });
  it('LANZA si la respuesta no es parseable (→ caller fail-closed)', async () => {
    const anthropic = mkAnthropic('no tengo idea');
    await expect(juezEducacionIA({ anthropic, texto: 'x' })).rejects.toThrow();
  });
  it('propaga el error si la API falla (→ caller fail-closed)', async () => {
    const anthropic = { messages: { create: vi.fn(async () => { throw new Error('429'); }) } };
    await expect(juezEducacionIA({ anthropic, texto: 'x' })).rejects.toThrow();
  });
  it('LANZA por timeout si la API tarda demasiado', async () => {
    const anthropic = { messages: { create: vi.fn(() => new Promise(() => {})) } }; // nunca resuelve
    await expect(juezEducacionIA({ anthropic, texto: 'x', timeoutMs: 20 })).rejects.toThrow(/timeout/);
  });
});
