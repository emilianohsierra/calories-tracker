import { describe, it, expect } from 'vitest';
import { normalizeQuery, simNombre, confidence, rankCandidates, decideMatch, normalizePresentacion, dedupKey, pickBestSource } from './product-brain';

// Cerebro del ProductSearchService — funciones puras/deterministas. Casos reales del brief.

describe('normalizeQuery', () => {
  it('string → { nombre } y detecta barcode numérico', () => {
    expect(normalizeQuery('Atún Dolores').nombre).toBe('Atún Dolores');
    expect(normalizeQuery('7501055300201').barcode).toBe('7501055300201');
    expect(normalizeQuery('7501055300201').nombre).toBe('');
  });
  it('objeto → campos trim', () => {
    expect(normalizeQuery({ nombre: ' Yogurt ', marca: 'Lala' })).toMatchObject({ nombre: 'Yogurt', marca: 'Lala' });
  });
});

describe('simNombre (Jaccard tokens + Levenshtein, sin acentos, orden-independiente)', () => {
  it('typo: "atun dolres" ≈ "Atún Dolores" (alto)', () => {
    expect(simNombre('atun dolres', 'Atún Dolores')).toBeGreaterThan(0.85);
  });
  it('orden-independiente', () => {
    expect(simNombre('Yogurt Griego', 'Griego Yogurt')).toBeGreaterThan(0.95);
  });
  it('distinto → bajo', () => {
    expect(simNombre('Atún Dolores', 'Sardinas Guaymas')).toBeLessThan(0.45);
  });
  it('vacíos', () => {
    expect(simNombre('', '')).toBe(1);
    expect(simNombre('atun', '')).toBe(0);
  });
});

describe('confidence + rankCandidates + decideMatch (umbrales 0.85 / 0.45)', () => {
  it('barcode exacto → 1.0 → auto', () => {
    const q = { barcode: '7501055300201', nombre: 'algo' };
    const c = { barcode: '7501055300201', nombre: 'Otra cosa' };
    expect(confidence(q, c)).toBe(1);
    expect(decideMatch(rankCandidates(q, [c])).modo).toBe('auto');
  });
  it('nombre+marca+presentación exactos → ≥0.85 → auto', () => {
    const q = { nombre: 'Yogurt Griego', marca: 'Lala', presentacion: '120 g' };
    const c = { nombre: 'Yogurt Griego', marca: 'Lala', presentacion: '120g' };
    expect(confidence(q, c)).toBeGreaterThanOrEqual(0.85);
    expect(decideMatch(rankCandidates(q, [c])).modo).toBe('auto');
  });
  it('nombre-solo NUNCA auto → disambiguation con "Atún Dolores" #1', () => {
    const q = { nombre: 'atun dolres' };
    const cands = [{ id: 1, nombre: 'Atún Dolores', marca: 'Dolores' }, { id: 2, nombre: 'Sardinas Guaymas' }];
    expect(confidence(q, cands[0])).toBeLessThan(0.85);
    const d = decideMatch(rankCandidates(q, cands));
    expect(d.modo).toBe('disambiguation');
    expect(d.candidatos[0].nombre).toBe('Atún Dolores');
  });
  it('nada parecido → no_encontrado', () => {
    expect(decideMatch(rankCandidates({ nombre: 'kiwi deshidratado' }, [{ nombre: 'Refresco de cola' }])).modo).toBe('no_encontrado');
  });
  it('umbrales custom respetados', () => {
    const ranked = [{ nombre: 'x', confidence: 0.6 }];
    expect(decideMatch(ranked, { auto: 0.5 }).modo).toBe('auto');
    expect(decideMatch(ranked, { auto: 0.9, disambiguation: 0.7 }).modo).toBe('no_encontrado');
  });
});

describe('normalizePresentacion (kg→g, L→ml, canónica)', () => {
  it('gramos', () => {
    expect(normalizePresentacion('120g')).toMatchObject({ value: 120, unit: 'g', canonica: '120|g' });
    expect(normalizePresentacion('120 g').canonica).toBe('120|g');
    expect(normalizePresentacion('0.12kg').canonica).toBe('120|g');
  });
  it('volumen: Coca 355/600/2L son DISTINTAS', () => {
    expect(normalizePresentacion('Coca 355 ml').canonica).toBe('355|ml');
    expect(normalizePresentacion('Coca 600ml').canonica).toBe('600|ml');
    expect(normalizePresentacion('Coca 2 L').canonica).toBe('2000|ml');
    const set = new Set(['355 ml', '600ml', '2 L'].map((t) => normalizePresentacion('Coca ' + t).canonica));
    expect(set.size).toBe(3);
  });
  it('piezas, coma decimal y sin unidad', () => {
    expect(normalizePresentacion('1 pieza').canonica).toBe('1|pieza');
    expect(normalizePresentacion('1,5 L').canonica).toBe('1500|ml');
    expect(normalizePresentacion('Coca sin tamaño')).toBeNull();
  });
});

describe('dedupKey (barcode aparte; nombre+marca+presentación normalizados)', () => {
  it('"Yogurt Griego Lala 120g" == "Lala Yogurt Griego 120 g"', () => {
    expect(dedupKey({ nombre: 'Yogurt Griego Lala 120g' })).toBe(dedupKey({ nombre: 'Lala Yogurt Griego 120 g' }));
  });
  it('Coca 355/600/2L → dedupKeys DISTINTAS', () => {
    const ks = ['Coca Cola 355 ml', 'Coca Cola 600 ml', 'Coca Cola 2 L'].map((n) => dedupKey({ nombre: n }));
    expect(new Set(ks).size).toBe(3);
  });
  it('marca separada es consistente', () => {
    expect(dedupKey({ nombre: 'Yogurt Griego 120 g', marca: 'Lala' })).toBe(dedupKey({ nombre: 'Griego Yogurt 120g', marca: 'Lala' }));
  });
});

describe('pickBestSource (verificado>usuario>estimado, luego reciente; NO fusiona)', () => {
  it('elige verificado sobre estimado y NO fusiona fibra', () => {
    const rows = [
      { nivel: 'estimado', kcal: 100, fibra: 5, source_updated_at: '2026-05-01' },
      { nivel: 'verificado', kcal: 98, source_updated_at: '2026-02-01' },
    ];
    const best = pickBestSource(rows);
    expect(best.nivel).toBe('verificado');
    expect(best.kcal).toBe(98);
    expect(best.fibra).toBeUndefined(); // fibra faltante = null (no se rellena del estimado)
  });
  it('a igual nivel, la más reciente por source_updated_at', () => {
    const rows = [
      { nivel: 'user', kcal: 1, source_updated_at: '2026-01-01' },
      { nivel: 'user', kcal: 2, source_updated_at: '2026-07-01' },
    ];
    expect(pickBestSource(rows).kcal).toBe(2);
  });
  it('sinónimos verified/user/ai; vacío → null', () => {
    expect(pickBestSource([{ confianza: 'ai', kcal: 1 }, { confianza: 'verified', kcal: 9 }]).kcal).toBe(9);
    expect(pickBestSource([])).toBeNull();
  });
});
