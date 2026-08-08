import { describe, it, expect } from 'vitest';
import { agregarAListaCompras, sugerirSustitucion } from './actions.js';
import { escribirLista } from '../pantry/shopping.js';

// Fake supabase para el insert (1er from = shopping_lists header; 2º = insert items).
function fakeSbWrite({ list, inserted }) {
  const calls = { insert: [] };
  const chain = (awaitData, single) => {
    const c = { select: () => c, eq: () => c, order: () => c, limit: () => c, insert: (r) => { calls.insert.push(r); return c; }, single: async () => ({ data: single }), maybeSingle: async () => ({ data: single }), then: (res) => res({ data: awaitData }) };
    return c;
  };
  let n = 0;
  return { from() { n += 1; return n === 1 ? chain(null, list) : chain(inserted, null); }, _calls: calls };
}

describe('agregarAListaCompras · Fase 7 (propone → confirma; números del MOTOR)', () => {
  it('cantidad del MOTOR (1) cuando el usuario no la da; NUNCA inventada por el modelo', async () => {
    const r = await agregarAListaCompras({ input: { items: [{ texto: 'Leche' }] }, ctx: { profile: {} } });
    expect(r.toolResult.ok).toBe(true);
    expect(r.toolResult.propone).toBe(true);
    expect(r.listaCompras[0].cantidad).toBe(1);
    expect(r.toolResult.items[0].cantidad).toBe(1);
  });

  it('respeta la cantidad que da el usuario (no la sobreescribe)', async () => {
    const r = await agregarAListaCompras({ input: { items: [{ texto: 'Huevo', cantidad: 12, unidad: 'pieza' }] }, ctx: { profile: {} } });
    expect(r.listaCompras[0].cantidad).toBe(12);
    expect(r.listaCompras[0].unidad).toBe('pieza');
  });

  it('AUTO: detecta AGOTADOS de la despensa (cantidad<=0) con cantidad 1 (motor)', async () => {
    const ctx = { profile: {}, despensaItems: [{ nombre: 'Arroz', cantidad: 0, unidad: 'kg' }, { nombre: 'Atún', cantidad: 2 }] };
    const r = await agregarAListaCompras({ input: { items: [] }, ctx });
    expect(r.listaCompras.map((x) => x.texto)).toEqual(['Arroz']); // solo el agotado
    expect(r.listaCompras[0].cantidad).toBe(1);
    expect(r.listaCompras[0].origen).toBe('despensa');
  });

  it('SEGURIDAD: NUNCA propone un alérgeno declarado', async () => {
    const r = await agregarAListaCompras({ input: { items: [{ texto: 'Crema de cacahuate' }, { texto: 'Arroz' }] }, ctx: { profile: { allergies: ['cacahuate'] } } });
    const nombres = r.listaCompras.map((x) => x.texto);
    expect(nombres).not.toContain('Crema de cacahuate');
    expect(nombres).toContain('Arroz');
  });

  it('B3: flujo del TOOL-PATH (agregarAListaCompras → escribirLista) PERSISTE la fila real', async () => {
    const exec = await agregarAListaCompras({ input: { items: [{ texto: 'leche' }] }, ctx: { profile: {} } });
    expect(exec.listaCompras).toHaveLength(1); // propuesta con belt de alérgeno
    const sb = fakeSbWrite({ list: { id: 'L1' }, inserted: [{ id: 'w1', texto_libre: 'leche', cantidad: 1, unidad: 'pieza', marcado: false, origen: 'coach' }] });
    const escritos = await escribirLista(sb, 'u1', exec.listaCompras); // lo que hace el tool-path ahora
    expect(escritos).toHaveLength(1);
    const rows = sb._calls.insert.flat();
    expect(rows[0]).toMatchObject({ user_id: 'u1', texto_libre: 'leche', cantidad: 1, unidad: 'pieza' }); // fila válida, sin null
  });

  it('sin nada que proponer → sin_propuesta', async () => {
    const r = await agregarAListaCompras({ input: { items: [] }, ctx: { profile: {}, despensaItems: [{ nombre: 'Atún', cantidad: 2 }] } });
    expect(r.toolResult.ok).toBe(false);
    expect(r.toolResult.error).toBe('sin_propuesta');
  });

  it('H1: AUTO NO propone un agotado con alérgeno OCULTO (belt completo, no solo el nombre)', async () => {
    const ctx = {
      profile: { allergies: ['cacahuate'] },
      despensaItems: [
        { nombre: 'Barra energética', cantidad: 0, unidad: 'pieza', confianza: 'verified', allergens: [], ingredientes: ['avena', 'cacahuate'] },
        { nombre: 'Arroz', cantidad: 0, unidad: 'kg', confianza: 'verified', allergens: [], ingredientes: ['arroz'] },
      ],
    };
    const r = await agregarAListaCompras({ input: { items: [] }, ctx });
    const nombres = r.listaCompras.map((x) => x.texto);
    expect(nombres).not.toContain('Barra energética'); // alérgeno oculto en ingredientes → fuera
    expect(nombres).toContain('Arroz');
  });
});

describe('sugerirSustitucion · Fase 7 (motor + safety; NUNCA un alérgeno declarado)', () => {
  const refresco = { pantry_item_id: 't', nombre: 'Refresco de cola', cantidad: 1, confianza: 'verified', allergens: [], ingredientes: ['agua', 'jarabe de maiz'], nutri_score: 'e', sellos: { activos: ['azucares', 'calorias'] } };
  const agua = { pantry_item_id: 'a', nombre: 'Agua mineral', cantidad: 1, confianza: 'verified', allergens: [], ingredientes: ['agua'], nutri_score: 'a', sellos: { activos: [] } };
  const malteada = { pantry_item_id: 'm', nombre: 'Malteada', cantidad: 1, confianza: 'verified', allergens: ['milk'], ingredientes: ['leche'], nutri_score: 'b', sellos: { activos: [] } };

  it('sugiere agua (mejor+segura) para el refresco; NUNCA la malteada (lácteo declarado)', () => {
    const r = sugerirSustitucion({ input: { producto: 'refresco' }, ctx: { profile: { allergies: ['leche'] }, despensaItems: [refresco, agua, malteada] } });
    const nombres = r.toolResult.sustituciones.map((s) => s.nombre);
    expect(nombres).toContain('Agua mineral');
    expect(nombres).not.toContain('Malteada');
    expect(r.toolResult.sustituciones[0].razon).toMatch(/sin|nutri|despensa/);
  });

  it('sin alternativa mejor+segura → honesto ([], nota clara, sin inventar)', () => {
    const r = sugerirSustitucion({ input: { producto: 'refresco' }, ctx: { profile: { allergies: ['leche'] }, despensaItems: [refresco, malteada] } });
    expect(r.toolResult.sustituciones).toEqual([]);
    expect(r.toolResult.nota).toMatch(/no encontré/i);
  });

  it('auto (sin producto) y nada con sellos → honesto, no fuerza sustituto', () => {
    const r = sugerirSustitucion({ input: { producto: '' }, ctx: { profile: {}, despensaItems: [agua] } });
    expect(r.toolResult.sustituciones).toEqual([]);
  });
});
