import { describe, it, expect } from 'vitest';
import { toClientListItem, readListItems, escribirLista } from './shopping.js';

// Fake supabase encadenable: 1er from() = shopping_lists (maybeSingle → header), 2º = items (await).
function fakeSb({ list, items }) {
  const calls = { eq: [] };
  const makeChain = (rowsForAwait, singleRow) => {
    const c = {
      select() { return c; },
      eq(k, v) { calls.eq.push([k, v]); return c; },
      order() { return c; },
      limit() { return c; },
      maybeSingle: async () => ({ data: singleRow }),
      then: (res) => res({ data: rowsForAwait }), // thenable para `await supabase.from(...)...`
    };
    return c;
  };
  let n = 0;
  return { from() { n += 1; return n === 1 ? makeChain(null, list) : makeChain(items, null); }, _calls: calls };
}

describe('shopping · toClientListItem', () => {
  it('mapea marcado→comprado, texto_libre→texto, cantidad numérica', () => {
    const it = toClientListItem({ id: 'x', product_id: null, texto_libre: 'Leche', cantidad: '2', unidad: 'L', marcado: true, origen: 'coach' });
    expect(it).toMatchObject({ id: 'x', texto: 'Leche', cantidad: 2, unidad: 'L', comprado: true, origen: 'coach' });
  });
  it('origen inválido → manual; cantidad null se conserva', () => {
    const it = toClientListItem({ id: 'y', texto_libre: 'Pan', marcado: false, origen: 'bogus' });
    expect(it.origen).toBe('manual');
    expect(it.cantidad).toBe(null);
  });
});

describe('shopping · readListItems (scoped por usuario + deploy-safe)', () => {
  it('SCOPED: filtra por user_id (defensa en profundidad además de RLS)', async () => {
    const sb = fakeSb({ list: { id: 'L1' }, items: [{ id: 'i1', texto_libre: 'Leche', marcado: false, origen: 'manual' }] });
    const out = await readListItems(sb, 'u1');
    expect(out).toHaveLength(1);
    expect(sb._calls.eq).toContainEqual(['user_id', 'u1']); // el query acota por el propio usuario
  });
  it('DEPLOY-SAFE: sin lista/tabla (data:null) → [] (no truena)', async () => {
    const sb = fakeSb({ list: null, items: [] });
    expect(await readListItems(sb, 'u1')).toEqual([]);
  });
});

// Fake para escribirLista: 1er from = shopping_lists (maybeSingle → header), 2º = insert items.
function fakeSbWrite({ list, inserted }) {
  const calls = { insert: [] };
  const makeChain = (awaitData, singleRow) => {
    const c = {
      select() { return c; },
      eq() { return c; },
      order() { return c; },
      limit() { return c; },
      insert(rows) { calls.insert.push(rows); return c; },
      single: async () => ({ data: singleRow }),
      maybeSingle: async () => ({ data: singleRow }),
      then: (res) => res({ data: awaitData }),
    };
    return c;
  };
  let n = 0;
  return { from() { n += 1; return n === 1 ? makeChain(null, list) : makeChain(inserted, null); }, _calls: calls };
}

describe('shopping · escribirLista (coach "anota X" → escribe scoped al user)', () => {
  it('escribe la fila con user_id + list_id y devuelve el item del cliente', async () => {
    const inserted = [{ id: 'w1', product_id: null, texto_libre: 'leche', cantidad: 1, unidad: null, marcado: false, origen: 'coach' }];
    const sb = fakeSbWrite({ list: { id: 'L1' }, inserted });
    const out = await escribirLista(sb, 'u1', [{ texto: 'leche', cantidad: 1, origen: 'coach' }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ texto: 'leche', comprado: false, origen: 'coach' });
    const rows = sb._calls.insert.flat();
    expect(rows[0]).toMatchObject({ user_id: 'u1', list_id: 'L1', texto_libre: 'leche' }); // SCOPED
  });
  it('sin ítems → [] (no escribe)', async () => {
    const sb = fakeSbWrite({ list: { id: 'L1' }, inserted: [] });
    expect(await escribirLista(sb, 'u1', [])).toEqual([]);
  });
});
