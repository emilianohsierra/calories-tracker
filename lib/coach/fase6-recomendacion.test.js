import { describe, it, expect } from 'vitest';
import { generarCena } from './actions.js';
import { calidadDeProducto } from '../pantry/db.js';

// Ítems de despensa con NUTRICIÓN REAL + calidad (shape de readItemsParaMatching, Fase 6).
const atun = { pantry_item_id: 'a', nombre: 'Atún', cantidad: 2, unidad: 'porcion', confianza: 'verified', ingredientes: ['atun'], allergens: ['fish'], nutri_score: 'b', nova_group: 1, sellos: { activos: [] }, nutricion: { base: 'por_100g', porcion_g: 100, kcal: 116, prot: 26, carb: 0, gras: 1, procedencia: 'verificado' } };
const yogur = { pantry_item_id: 'y', nombre: 'Yogur natural', cantidad: 1, unidad: 'porcion', confianza: 'verified', ingredientes: ['leche', 'cultivos'], allergens: ['milk'], nutri_score: 'a', nova_group: 1, sellos: { activos: [] }, nutricion: { base: 'por_100g', porcion_g: 150, kcal: 60, prot: 10, carb: 4, gras: 0.4, procedencia: 'verificado' } };
const galleta = { pantry_item_id: 'g', nombre: 'Galletas', cantidad: 1, unidad: 'porcion', confianza: 'verified', ingredientes: ['harina', 'azucar', 'aceite'], allergens: ['gluten'], nutri_score: 'd', nova_group: 4, sellos: { activos: ['azucares', 'calorias'] }, nutricion: { base: 'por_100g', porcion_g: 30, kcal: 480, prot: 6, carb: 65, gras: 20, procedencia: 'verificado' } };

function ctxBase(over = {}) {
  return {
    profile: { coach: 'hipertrofia', allergies: [], intolerances: [] },
    today: { date: '2026-08-06', pendientes: { kcal: 400, prot: 35, carb: 30, fat: 15 } },
    despensa: [],
    despensaItems: [atun, yogur],
    ...over,
  };
}
const input = { momento: 'cena', n_opciones: 2, ingredientes_disponibles: [] };

describe('generarCena · Fase 6 — recomendación con números REALES del Product-DB', () => {
  it('usa el motor DETERMINISTA (estimado:false) con números reales y NO llama al modelo', async () => {
    const anthropic = { messages: { create: () => { throw new Error('no debe llamar al modelo'); } } };
    const r = await generarCena({ anthropic, model: 'm', input, ctx: ctxBase() });
    expect(r.toolResult.ok).toBe(true);
    expect(r.toolResult.estimado).toBe(false);
    expect(r.toolResult.real).toBe(true);
    const soloAtun = r.opciones.find((o) => o.ingredientes.length === 1 && o.ingredientes[0] === 'Atún');
    expect(soloAtun.kcal).toBe(116); // número REAL del producto (atún 100 g)
    expect(soloAtun.prot_g).toBe(26);
    // el toolResult expone las cifras reales + pendientes para que el modelo las CITE (no invente)
    expect(r.toolResult.opciones[0]).toHaveProperty('kcal');
    expect(r.toolResult.pendientes.kcal).toBe(400);
  });

  it('EXCLUYE un producto con alérgeno declarado (yogur→leche); nunca lo recomienda', async () => {
    const r = await generarCena({ anthropic: null, model: 'm', input, ctx: ctxBase({ profile: { coach: 'hipertrofia', allergies: ['leche'], intolerances: [] } }) });
    const nombres = r.opciones.flatMap((o) => o.ingredientes);
    expect(nombres).not.toContain('Yogur natural');
    expect(nombres).toContain('Atún');
  });

  it('respeta las kcal RESTANTES: descarta el combo que las revienta (>140%)', async () => {
    const r = await generarCena({ anthropic: null, model: 'm', input, ctx: ctxBase({ despensaItems: [atun, galleta], today: { date: '2026-08-06', pendientes: { kcal: 200, prot: 30, carb: 20, fat: 10 } } }) });
    const soloGalleta = r.opciones.find((o) => o.ingredientes.length === 1 && o.ingredientes[0] === 'Galletas');
    expect(soloGalleta).toBeUndefined(); // 480 kcal > 200×1.4 → filtrada
    expect(r.opciones.some((o) => o.ingredientes.includes('Atún'))).toBe(true);
  });

  it('H1: verified con allergens=[] pero INGREDIENTES reales con cacahuate + alergia → EXCLUIDO', async () => {
    // Ventana OFF-tag-gap: sin tag y el nombre no dice cacahuate; la lista REAL de ingredientes sí.
    const barra = { pantry_item_id: 'b', nombre: 'Barra energética', cantidad: 1, unidad: 'porcion', confianza: 'verified', allergens: [], ingredientes: ['avena', 'cacahuate', 'miel'], nutricion: { base: 'por_100g', porcion_g: 40, kcal: 180, prot: 6, carb: 20, gras: 8, procedencia: 'verificado' } };
    const r = await generarCena({ anthropic: null, model: 'm', input, ctx: ctxBase({ despensaItems: [atun, barra], profile: { coach: 'hipertrofia', allergies: ['cacahuate'], intolerances: [] } }) });
    const nombres = r.opciones.flatMap((o) => o.ingredientes);
    expect(nombres).not.toContain('Barra energética');
    expect(nombres).toContain('Atún');
  });

  it('H1 residual: verified con CERO señal (allergens=[] y sin ingredientes) + alergia ANAFILÁCTICA → EXCLUIDO', async () => {
    const misterio = { pantry_item_id: 'x', nombre: 'Producto empacado', cantidad: 1, unidad: 'porcion', confianza: 'verified', allergens: [], ingredientes: [], nutricion: { base: 'por_100g', porcion_g: 50, kcal: 200, prot: 5, carb: 30, gras: 8, procedencia: 'verificado' } };
    const r = await generarCena({ anthropic: null, model: 'm', input, ctx: ctxBase({ despensaItems: [atun, misterio], profile: { coach: 'hipertrofia', allergies: ['cacahuate'], intolerances: [] } }) });
    const nombres = r.opciones.flatMap((o) => o.ingredientes);
    expect(nombres).not.toContain('Producto empacado'); // fail-safe: sin señal + anafiláctico → fuera
  });

  it('adjunta CONTEXTO de calidad (sellos/nutri_score) + disclaimer no-médico', async () => {
    const r = await generarCena({ anthropic: null, model: 'm', input, ctx: ctxBase({ despensaItems: [galleta], today: { date: '2026-08-06', pendientes: { kcal: 1500, prot: 40, carb: 150, fat: 50 } } }) });
    const g = r.opciones.find((o) => o.ingredientes.includes('Galletas'));
    expect(g.calidad.sellos).toEqual(expect.arrayContaining(['azucares', 'calorias']));
    expect(g.calidad.nutri_score).toContain('d');
    expect(r.toolResult.nota).toMatch(/no consejo médico/i);
  });
});

describe('calidadDeProducto · producto SIN nutrición no se presenta como exacto', () => {
  it('sin product_nutrition → sellos null (nada inventado)', () => {
    expect(calidadDeProducto({ nutri_score: 'c', nova_group: 2, product_nutrition: [] }, 'g')).toMatchObject({ nutri_score: 'c', nova_group: 2, sellos: null });
    expect(calidadDeProducto(null, 'g')).toEqual({ nutri_score: null, nova_group: null, sellos: null });
  });
  it('con nutrición per-100g + ingredientes → computa sellos (gate de añadidos)', () => {
    const prod = { nutri_score: 'e', nova_group: 4, categories: { name: 'Refrescos' }, product_nutrition: [{ nivel: 'verificado', base_unit: 'ml', calories: 80, protein_g: 0, carbs_g: 20, fat_g: 0, azucar_g: 18 }], product_ingredients: [{ ingredient: 'Jarabe de maíz de alta fructosa' }] };
    const c = calidadDeProducto(prod, 'ml');
    expect(c.sellos.activos).toEqual(expect.arrayContaining(['azucares', 'calorias']));
  });
});
