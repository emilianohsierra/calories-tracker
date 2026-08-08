import { describe, it, expect } from 'vitest';
import { productoUsuarioRow, nutricionUsuarioRow, addProductImage } from './catalog.js';

// S-I2 (Slowking): el insert de imagen ya NO traga el error (antes = éxito silencioso).
describe('catalog · addProductImage captura el error (S-I2)', () => {
  const sbWith = (result) => ({ from: () => ({ insert: () => ({ select: () => ({ maybeSingle: async () => result }) }) }) });
  it('error del insert → devuelve null (no fabrica id) y no lanza', async () => {
    const sb = sbWith({ data: null, error: { message: 'fk', code: '23503' } });
    expect(await addProductImage(sb, { product_id: 'p1', image_url: 'http://x/i.jpg' })).toBe(null);
  });
  it('ok → devuelve el id de la imagen', async () => {
    const sb = sbWith({ data: { id: 'img1' }, error: null });
    expect(await addProductImage(sb, { product_id: 'p1', image_url: 'http://x/i.jpg' })).toBe('img1');
  });
});

describe('catalog · productoUsuarioRow (producto propio MARCADO)', () => {
  it('marca is_user_created + origen user + confianza baja (no verificado)', () => {
    const row = productoUsuarioRow({ nombre: 'Granola casera', marca: 'Doña Eva', presentacion: '500|g', unidad: 'g', dedup_key: 'k', userId: 'u1' });
    expect(row).toMatchObject({ name: 'Granola casera', origen: 'user', is_user_created: true, confidence_score: 0.3, default_unit: 'g', presentacion: '500|g' });
    expect(row.norm).toContain('granola');
  });
  it('defaults seguros (sin unidad → pieza; sin imagen → null)', () => {
    const row = productoUsuarioRow({ nombre: 'X' });
    expect(row.default_unit).toBe('pieza');
    expect(row.image_url).toBe(null);
  });
});

describe('catalog · nutricionUsuarioRow (nivel usuario, alias, nada de invención)', () => {
  it('mapea claves del cliente y tolera alias sodio/sodio_mg; ausente = null', () => {
    const row = nutricionUsuarioRow('p1', { kcal: 120, prot: 5, sodio: 200, base: 'por_100g' }, 'u1', '2026-08-05T00:00:00Z');
    expect(row).toMatchObject({ product_id: 'p1', nivel: 'usuario', source: 'user_manual', calories: 120, protein_g: 5, sodium_mg: 200 });
    expect(row.carbs_g).toBe(null); // no se inventa
    expect(row.fiber_g).toBe(null);
    expect(row.base_unit).toBe('g');
    expect(row.source_updated_at).toBe('2026-08-05T00:00:00Z');
  });
  it('por_porcion usa base_amount = porción', () => {
    const row = nutricionUsuarioRow('p2', { base: 'por_porcion', porcion: 30, kcal: 90 }, 'u1', 't');
    expect(row.base_unit).toBe('porcion');
    expect(row.base_amount).toBe(30);
  });
  it('nunca marca verificado', () => {
    const row = nutricionUsuarioRow('p3', { kcal: 1 }, 'u1', 't');
    expect(row.nivel).toBe('usuario');
  });
});
