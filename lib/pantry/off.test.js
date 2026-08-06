import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchOFF, normalizeAllergens, searchOFFByName } from './off.js';

describe('pantry/off · normalizeAllergens (OFF tokens crudos, estilo en:milk)', () => {
  it('quita el prefijo de idioma y conserva el token OFF (lo mapea Karpathy)', () => {
    expect(normalizeAllergens(['en:milk', 'en:gluten'])).toEqual(['milk', 'gluten']);
    expect(normalizeAllergens(['en:peanuts'])).toEqual(['peanuts']);
    expect(normalizeAllergens(['en:tree-nuts'])).toEqual(['tree-nuts']);
    expect(normalizeAllergens('en:fish,en:soybeans')).toEqual(['fish', 'soybeans']);
    expect(normalizeAllergens(['en:milk', 'en:milk'])).toEqual(['milk']); // dedup
  });
  it('4 grupos nuevos (mostaza/apio/sulfitos/altramuz) con el token que espera Karpathy', () => {
    expect(normalizeAllergens(['en:mustard', 'en:celery', 'en:lupin'])).toEqual(['mustard', 'celery', 'lupin']);
    expect(normalizeAllergens(['en:sulphur-dioxide-and-sulphites'])).toEqual(['sulphites']); // alias
    expect(normalizeAllergens(['en:sulfur-dioxide-and-sulfites'])).toEqual(['sulphites']);
  });
  it('conserva desconocidos y maneja vacío/null', () => {
    expect(normalizeAllergens(['en:someexotic'])).toEqual(['someexotic']);
    expect(normalizeAllergens([])).toEqual([]);
    expect(normalizeAllergens(null)).toEqual([]);
  });

  // INTEGRACIÓN CTO↔Karpathy: los tokens que emite normalizeAllergens = lo que canonGrupo debe
  // mapear 1:1. Si esto cambia, avisar a Karpathy (safety.js). Cubre el vocabulario definitivo.
  it('INTEGRACIÓN: payload OFF real → tokens exactos que Karpathy mapea', () => {
    expect(normalizeAllergens(['en:milk'])).toEqual(['milk']); // el caso del bloqueante
    // combinación realista de allergens_tags de un producto OFF
    const tags = ['en:gluten', 'en:milk', 'en:eggs', 'en:nuts', 'en:peanuts', 'en:soybeans', 'en:fish', 'en:crustaceans', 'en:molluscs', 'en:sesame-seeds', 'en:mustard', 'en:celery', 'en:sulphur-dioxide-and-sulphites', 'en:lupin'];
    expect(normalizeAllergens(tags)).toEqual([
      'gluten', 'milk', 'eggs', 'nuts', 'peanuts', 'soybeans', 'fish', 'crustaceans', 'molluscs', 'sesame-seeds', 'mustard', 'celery', 'sulphites', 'lupin',
    ]);
    // sub-tipos de fruto seco que OFF puede emitir directo
    expect(normalizeAllergens(['en:almonds', 'en:hazelnuts', 'en:cashew-nuts'])).toEqual(['almonds', 'hazelnuts', 'cashew-nuts']);
  });
});

afterEach(() => vi.unstubAllGlobals());

function stubFetch(json, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => json })));
}

describe('pantry/off · fetchOFF (mapeo Open Food Facts → catálogo)', () => {
  it('mapea nutriments por 100 g con procedencia verificado', async () => {
    stubFetch({
      status: 1,
      product: {
        product_name: 'Atún en agua', brands: 'Dolores, Otra', image_url: 'http://x/img.jpg', categories: 'Pescados, Enlatados',
        nutriments: { 'energy-kcal_100g': 116, proteins_100g: 26, carbohydrates_100g: 0, fat_100g: 1, fiber_100g: 0, sugars_100g: 0, sodium_100g: 0.3 },
      },
    });
    const off = await fetchOFF('7501234567890');
    expect(off.nombre).toBe('Atún en agua');
    expect(off.marca).toBe('Dolores'); // primera marca
    expect(off.categoria).toBe('Enlatados'); // última categoría
    expect(off.nutricion).toMatchObject({ base: 'por_100g', kcal: 116, prot: 26, carb: 0, gras: 1, procedencia: 'verificado' });
    expect(off.nutricion.sodio_mg).toBe(300); // 0.3 g → 300 mg
  });

  it('deriva kcal de energy_100g (kJ) si falta energy-kcal', async () => {
    stubFetch({ status: 1, product: { product_name: 'X', nutriments: { energy_100g: 418.4, proteins_100g: 5 } } });
    const off = await fetchOFF('1');
    expect(off.nutricion.kcal).toBe(100); // 418.4 kJ / 4.184
  });

  it('CABLEA los campos Fase 4 en mapOFF (nutriscore/nova/serving/trans/country real)', async () => {
    stubFetch({
      status: 1,
      product: {
        product_name: 'Mayonesa McCormick', brands: 'McCormick',
        nutriscore_grade: 'D', nova_group: 4, serving_quantity: 15,
        countries_tags: ['en:mexico'], // país REAL (autoritativo)
        nutriments: { 'energy-kcal_100g': 680, proteins_100g: 1, 'trans-fat_100g': 0.2, 'saturated-fat_100g': 8, sodium_100g: 0.6 },
      },
    });
    const off = await fetchOFF('7501003334367');
    expect(off.nutri_score).toBe('d');      // normalizado a minúscula
    expect(off.nova_group).toBe(4);
    expect(off.serving_size).toBe(15);
    expect(off.serving_unit).toBe('g');
    expect(off.country).toBe('MX');         // de countries_tags, NO del GS1
    expect(off.nutricion.grasa_trans).toBe(0.2);
    expect(off.nutricion.grasa_sat).toBe(8);
    expect(off.nutricion.sodio_mg).toBe(600);
  });

  it('Fase 5: cablea ingredientes (position) y aditivos (código E, name null, sin riesgo)', async () => {
    stubFetch({
      status: 1,
      product: {
        product_name: 'Galletas', brands: 'Marca',
        ingredients: [{ text: 'Harina de trigo' }, { text: 'Azúcar' }, { id: 'en:salt', text: 'Sal' }],
        additives_tags: ['en:e330', 'en:e322', 'en:e330', 'en:notacode'],
        nutriments: { 'energy-kcal_100g': 480 },
      },
    });
    const off = await fetchOFF('7501000000001');
    expect(off.ingredientes).toEqual([
      { ingredient: 'Harina de trigo', position: 1 },
      { ingredient: 'Azúcar', position: 2 },
      { ingredient: 'Sal', position: 3 },
    ]);
    expect(off.aditivos).toEqual([
      { additive_code: 'E330', name: null },
      { additive_code: 'E322', name: null }, // dedup + descarta 'notacode'
    ]);
  });

  it('clamp: nutrimento NEGATIVO → null (no fabrica; Slowking H3)', async () => {
    stubFetch({ status: 1, product: { product_name: 'X', nutriments: { 'energy-kcal_100g': -50, proteins_100g: 5 } } });
    const off = await fetchOFF('1');
    expect(off.nutricion.kcal).toBe(null);
    expect(off.nutricion.prot).toBe(5);
  });

  it('devuelve null si el producto no existe o falla (no dependencia dura)', async () => {
    stubFetch({ status: 0 });
    expect(await fetchOFF('0')).toBe(null);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    expect(await fetchOFF('0')).toBe(null);
  });
});

describe('pantry/off · searchOFFByName (búsqueda por nombre → productos reales con code)', () => {
  it('mapea hits[] de Search-a-licious (brands ARRAY) y descarta los que no traen barcode', async () => {
    stubFetch({
      hits: [
        { code: '7501055310333', product_name: 'Mayonesa McCormick Light', brands: ['McCormick'], image_url: 'http://x/m.jpg', nutriments: { 'energy-kcal_100g': 350, proteins_100g: 1, sodium_100g: 0.5 } },
        { code: '', product_name: 'Sin código', nutriments: {} }, // sin barcode → se descarta
      ],
    });
    const out = await searchOFFByName('mayonesa mccormick light');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: '7501055310333', nombre: 'Mayonesa McCormick Light', marca: 'McCormick' });
    expect(out[0].nutricion.kcal).toBe(350);
    expect(out[0].nutricion.sodio_mg).toBe(500); // 0.5 g → 500 mg
  });
  it('query muy corta o fallo → [] (nunca lanza)', async () => {
    expect(await searchOFFByName('a')).toEqual([]);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net'); }));
    expect(await searchOFFByName('mayonesa')).toEqual([]);
  });
});
