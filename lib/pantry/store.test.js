import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPantry, PantryError } from './store.js';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status, body) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ status, ok: status >= 200 && status < 300, json: async () => body })));
}

// B1: la despensa es data del SERVIDOR. getPantry NO debe fabricar seed ni tragar errores.
describe('pantry/store · getPantry (B1: refleja el servidor; sin seed ni pérdida silenciosa)', () => {
  it('ok → items REALES del servidor', async () => {
    stubFetch(200, { items: [{ id: 'a', nombre: 'Atún' }] });
    expect(await getPantry()).toEqual([{ id: 'a', nombre: 'Atún' }]);
  });
  it('401 → lanza PantryError code "unauthorized" (el UI manda a login; NADA de seed)', async () => {
    stubFetch(401, {});
    await expect(getPantry()).rejects.toBeInstanceOf(PantryError);
    await expect(getPantry()).rejects.toMatchObject({ code: 'unauthorized' });
  });
  it('500 → lanza (activa el estado de error REAL del UI; antes era código muerto)', async () => {
    stubFetch(500, {});
    await expect(getPantry()).rejects.toMatchObject({ code: 'server' });
  });
  it('fallo de red → lanza (no cae a un mock de 4 productos ficticios)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    await expect(getPantry()).rejects.toMatchObject({ code: 'network' });
  });
  it('el módulo NO exporta ningún SEED/mock', async () => {
    const mod = await import('./store.js');
    expect(mod.SEED).toBeUndefined();
    expect(mod.readLocal).toBeUndefined();
  });
});
