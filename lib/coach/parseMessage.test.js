import { describe, it, expect } from 'vitest';
import { parseMessage } from './parseMessage.js';

describe('parseMessage', () => {
  it('parsea la respuesta estructurada de la tool responder', () => {
    const json = JSON.stringify({
      titular: 'Vas corto de proteína: 48 de 119 g, te faltan 71 g.',
      bloques: [{ tipo: 'nutrition', metrica: 'proteina', consumido: 48, objetivo: 119, pendiente: 71, unidad: 'g' }],
      accion: { label: 'Ver cena rica en proteína', accion: 'generar_cena', ref: 'cena' },
    });
    const r = parseMessage(json);
    expect(r.kind).toBe('structured');
    expect(r.data.titular).toContain('proteína');
    expect(r.data.bloques).toHaveLength(1);
    expect(r.data.bloques[0].tipo).toBe('nutrition');
    expect(r.data.accion.accion).toBe('generar_cena');
  });

  it('acepta un objeto ya estructurado (respuesta en vivo)', () => {
    const r = parseMessage({ titular: 'Hola', bloques: [], accion: { label: '', accion: 'ninguna', ref: '' } });
    expect(r.kind).toBe('structured');
    expect(r.data.titular).toBe('Hola');
  });

  it('recorta a 3 bloques y descarta bloques sin tipo', () => {
    const obj = {
      titular: 't',
      bloques: [
        { tipo: 'nutrition' }, { tipo: 'meal' }, { tipo: 'recommendation' }, { tipo: 'workout' },
        { sin: 'tipo' },
      ],
      accion: {},
    };
    const r = parseMessage(JSON.stringify(obj));
    expect(r.data.bloques).toHaveLength(3);
    expect(r.data.accion.accion).toBe('ninguna');
  });

  it('trata el texto plano como markdown', () => {
    const r = parseMessage('Come más proteína hoy.');
    expect(r.kind).toBe('markdown');
    expect(r.text).toBe('Come más proteína hoy.');
  });

  it('trata el Markdown crudo como markdown (para sanitizar en UI)', () => {
    const md = '## Título\n\n**Proteína** 48/119 g\n\n| a | b |\n|---|---|';
    const r = parseMessage(md);
    expect(r.kind).toBe('markdown');
    expect(r.text).toBe(md);
  });

  it('un JSON malformado cae a markdown, no revienta', () => {
    const r = parseMessage('{ titular: roto, sin comillas }');
    expect(r.kind).toBe('markdown');
  });

  it('un JSON válido sin titular no se trata como estructurado', () => {
    const r = parseMessage('{"foo":"bar"}');
    expect(r.kind).toBe('markdown');
  });

  it('maneja null/undefined sin romper', () => {
    expect(parseMessage(null).kind).toBe('markdown');
    expect(parseMessage(undefined).kind).toBe('markdown');
  });

  it('JSON de responder TRUNCADO (cortado por max_tokens / emitido como texto) rescata el titular, NO muestra llaves crudas', () => {
    const truncado = '{"titular":"Con diabetes necesitas seguimiento de un profesional.","bloques":[{"tipo":"recommendation","texto":"Consulta con tu m';
    const r = parseMessage(truncado);
    expect(r.kind).toBe('structured');
    expect(r.data.titular).toBe('Con diabetes necesitas seguimiento de un profesional.');
    expect(r.data.bloques).toEqual([]);
  });

  it('JSON estructurado COMPLETO (aunque venga como texto) se parsea con sus bloques', () => {
    const completo = JSON.stringify({ titular: 'Derivo a profesional.', bloques: [{ tipo: 'recommendation', texto: 'Consulta con tu medico.' }], accion: { label: '', accion: 'ninguna', ref: '' } });
    const r = parseMessage(completo);
    expect(r.kind).toBe('structured');
    expect(r.data.titular).toBe('Derivo a profesional.');
    expect(r.data.bloques).toHaveLength(1);
    expect(r.data.bloques[0].tipo).toBe('recommendation');
  });

  it('titular con comillas escapadas se rescata correctamente cuando esta truncado', () => {
    const truncado = '{"titular":"Dice \\"cuidado\\" con eso","bloques":[{"tipo":"recomm';
    const r = parseMessage(truncado);
    expect(r.kind).toBe('structured');
    expect(r.data.titular).toContain('cuidado');
  });

});
