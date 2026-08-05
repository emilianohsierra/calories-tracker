import { describe, it, expect, vi } from 'vitest';
import { buscarProducto, toProducto } from './product-search.js';

// Cerebro FAKE inyectable (las funciones puras reales son de Karpathy, product-brain.js).
function fakeBrain(overrides = {}) {
  return {
    dedupKey: () => 'k',
    rankCandidates: (_q, cands) => cands,
    decideMatch: () => ({ modo: 'no_encontrado' }),
    pickBestSource: (rows) => rows[0] || null,
    ...overrides,
  };
}

// deps base: todo el I/O inyectado (sin tocar Supabase real).
function baseDeps(over = {}) {
  return {
    brain: fakeBrain(over.brain),
    admin: {}, // presencia truthy → habilita cacheOFF
    now: (() => { let t = 0; return () => (t += 100); })(),
    localByBarcode: vi.fn(async () => null),
    localByDedup: vi.fn(async () => []),
    localFuzzy: vi.fn(async () => []),
    excedioRate: vi.fn(async () => false),
    logFetch: vi.fn(async () => {}),
    fetchOFF: vi.fn(async () => null),
    cacheOFF: vi.fn(async () => 'prod-1'),
    searchOFFByName: vi.fn(async () => []), // por defecto sin resultados OFF (no red en tests)
    identificarExterno: vi.fn(async () => null),
    ...over.deps,
  };
}

describe('ProductSearchService · buscarProducto (cascada cache-first)', () => {
  it('1) barcode local → auto directo (confianza 1.0, source db)', async () => {
    const producto = { product_id: 'p1', nombre: 'Atún', nutricion: { kcal: 116 } };
    const deps = baseDeps({ deps: { localByBarcode: vi.fn(async () => producto) } });
    const r = await buscarProducto(deps, { barcode: '750123', userId: 'u1' });
    expect(r).toMatchObject({ match: 'auto', producto, confianza: 1.0, source: 'db' });
    expect(deps.fetchOFF).not.toHaveBeenCalled(); // no pega externo si hay cache
  });

  it('2) nombre local → disambiguation cuando el cerebro decide 0.45–0.85', async () => {
    const cands = [{ product_id: 'a' }, { product_id: 'b' }];
    const deps = baseDeps({
      brain: { decideMatch: () => ({ modo: 'disambiguation', candidatos: cands }) },
      deps: { localFuzzy: vi.fn(async () => cands) },
    });
    const r = await buscarProducto(deps, { nombre: 'yogur' });
    expect(r).toMatchObject({ match: 'disambiguation', source: 'db' });
    expect(r.candidatos).toHaveLength(2);
  });

  it('2b) nombre SIN match local + OFF por nombre trae reales → disambiguation (aparecen, no miss)', async () => {
    const offRes = [
      { code: '7501', nombre: 'Mayonesa McCormick Light', marca: 'McCormick', nutricion: { kcal: 350 }, image_url: 'http://x/m.jpg' },
      { code: '7502', nombre: 'Mayonesa McCormick', marca: 'McCormick', nutricion: { kcal: 680 }, image_url: '' },
    ];
    const deps = baseDeps({
      // el cerebro real no auto-acepta por nombre; forzamos no_encontrado para probar "nunca esconder"
      brain: { rankCandidates: (_q, c) => c, decideMatch: () => ({ modo: 'no_encontrado', candidatos: [] }) },
      deps: { localFuzzy: vi.fn(async () => []), searchOFFByName: vi.fn(async () => offRes) },
    });
    const r = await buscarProducto(deps, { nombre: 'mayonesa mccormick light', userId: 'u1' });
    expect(deps.cacheOFF).toHaveBeenCalledTimes(2); // persiste SOLO OFF (crece la DB)
    expect(r.match).toBe('disambiguation'); // NUNCA esconde: muestra los cercanos aunque conf. baja
    expect(r.candidatos).toHaveLength(2);
    expect(r.source).toBe('open_food_facts');
    expect(r.candidatos[0].nombre).toContain('Mayonesa');
  });

  it('2c) nombre sin match local NI en OFF → miss (UI: agregar el tuyo precargado)', async () => {
    const deps = baseDeps({ deps: { localFuzzy: vi.fn(async () => []), searchOFFByName: vi.fn(async () => []) } });
    const r = await buscarProducto(deps, { nombre: 'productoquenoexiste123', userId: 'u1' });
    expect(r).toMatchObject({ match: 'miss', producto: null, source: null });
  });

  it('3) nombre local → auto cuando el cerebro decide ≥0.85', async () => {
    const prod = { product_id: 'x' };
    const deps = baseDeps({
      brain: { decideMatch: () => ({ modo: 'auto', producto: prod, confianza: 0.9 }) },
      deps: { localFuzzy: vi.fn(async () => [prod]) },
    });
    const r = await buscarProducto(deps, { nombre: 'atun dolores' });
    expect(r).toMatchObject({ match: 'auto', producto: prod, confianza: 0.9, source: 'db' });
  });

  it('4) miss local + OFF hit → PERSISTE (cacheOFF) y devuelve verificado', async () => {
    const off = { nombre: 'Leche', marca: 'Lala', nutricion: { kcal: 60 }, image_url: 'http://x/i.jpg' };
    const cached = { product_id: 'p9', nombre: 'Leche', confianza: 'verified' };
    const localByBarcode = vi.fn()
      .mockResolvedValueOnce(null)   // 1er intento local: miss
      .mockResolvedValueOnce(cached); // tras cachear: hit canónico
    const deps = baseDeps({ deps: { localByBarcode, fetchOFF: vi.fn(async () => off) } });
    const r = await buscarProducto(deps, { barcode: '750999', userId: 'u1' });
    expect(deps.cacheOFF).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ match: 'auto', source: 'open_food_facts', atribucion: 'Datos de Open Food Facts' });
    expect(r.producto).toBe(cached);
  });

  it('5) OFF miss + identificación externa → miss contribuible, NUTRICIÓN null, NO persiste', async () => {
    const ident = { nombre: 'Galletas', marca: 'Marinela', image_url: 'http://x/g.jpg', source: 'upcitemdb' };
    const deps = baseDeps({ deps: { fetchOFF: vi.fn(async () => null), identificarExterno: vi.fn(async () => ident) } });
    const r = await buscarProducto(deps, { barcode: '750777', userId: 'u1' });
    expect(deps.cacheOFF).not.toHaveBeenCalled(); // regla: persistir SOLO OFF
    expect(r).toMatchObject({ match: 'miss', source: 'upcitemdb', contribuible: true });
    expect(r.producto.nombre).toBe('Galletas');
    expect(r.producto.nutricion).toBe(null); // NADA de invención
  });

  it('6) rate-limit → miss motivo rate_limit, sin pegar a OFF', async () => {
    const deps = baseDeps({ deps: { excedioRate: vi.fn(async () => true) } });
    const r = await buscarProducto(deps, { barcode: '750000', userId: 'u1' });
    expect(r).toMatchObject({ match: 'miss', motivo: 'rate_limit', source: null });
    expect(deps.fetchOFF).not.toHaveBeenCalled();
  });

  it('6b) FAIL-CLOSED: admin null → NO corre el path externo (excedioRate real → rate-limited)', async () => {
    const fetchOFF = vi.fn(async () => ({ nombre: 'X' }));
    // Sin inyectar excedioRate → usa el default real, que con admin:null devuelve true (fail-closed).
    const r = await buscarProducto(
      { brain: fakeBrain(), admin: null, fetchOFF, localByBarcode: async () => null, logFetch: async () => {} },
      { barcode: '750222', userId: 'u1' }
    );
    expect(fetchOFF).not.toHaveBeenCalled();
    expect(r).toMatchObject({ match: 'miss', motivo: 'rate_limit' });
  });

  it('7) todo miss → fallback gracioso (miss, producto null)', async () => {
    const deps = baseDeps();
    const r = await buscarProducto(deps, { barcode: '751111', userId: 'u1' });
    expect(r).toMatchObject({ match: 'miss', producto: null, source: null });
    expect(deps.logFetch).toHaveBeenCalled(); // observabilidad
  });
});

describe('ProductSearchService · toProducto (pickBestSource + nada de invención)', () => {
  it('elige la mejor fila (cerebro) y expone allergens SOLO en verificado', async () => {
    const p = {
      id: 'p1', name: 'Atún', brands: { name: 'Dolores' }, categories: { name: 'Enlatados' }, image_url: 'http://x.jpg', presentacion: '140|g',
      product_nutrition: [
        { base_unit: 'g', calories: 116, protein_g: 26, fiber_g: null, allergens: ['fish'], nivel: 'verificado' },
        { base_unit: 'g', calories: 999, nivel: 'estimado_ia', allergens: ['nope'] },
      ],
    };
    const brain = fakeBrain({ pickBestSource: (rows) => rows.find((r) => r.nivel === 'verificado') });
    const out = toProducto(p, brain);
    expect(out).toMatchObject({ nombre: 'Atún', marca: 'Dolores', confianza: 'verified', presentacion: '140|g' });
    expect(out.nutricion.kcal).toBe(116);
    expect(out.nutricion.fibra).toBe(null); // dato ausente = null (no se rellena de otra fuente)
    expect(out.allergens).toEqual(['fish']);
  });

  it('allergens NO se expone en filas no verificadas (DESCONOCIDO)', () => {
    const p = { id: 'p2', name: 'X', product_nutrition: [{ base_unit: 'g', calories: 10, allergens: ['milk'], nivel: 'usuario' }] };
    const out = toProducto(p, fakeBrain());
    expect(out.confianza).toBe('user');
    expect(out.allergens).toEqual([]); // un [] verificado-falso sería peligroso
  });
});
