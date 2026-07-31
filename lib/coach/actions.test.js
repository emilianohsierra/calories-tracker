import { describe, it, expect } from 'vitest';
import { validateMeal } from '../meals/insert.js';
import { registrarComidaFoto } from './actions.js';

// Stub mínimo del cliente supabase: captura la fila insertada.
function fakeSupabase(captured, error = null) {
  return {
    from() {
      return {
        insert(row) {
          captured.row = row;
          return Promise.resolve({ error });
        },
      };
    },
  };
}

const analysis = {
  titulo: 'Tacos al pastor',
  descripcion: '3 tacos',
  tipo_comida: 'cena',
  calorias: 620,
  proteinas_g: 40,
  carbohidratos_g: 60,
  grasas_g: 22,
  ingredientes: ['tortilla', 'cerdo', 'piña', 'queso'],
  confianza: 'media',
  imagen: 'abc123.jpg',
};

describe('validateMeal', () => {
  it('acepta una comida válida y coacciona números', () => {
    const v = validateMeal({ date: '2026-07-31', time: '14:30', title: 'X', calories: '620.4', protein_g: '40.2' });
    expect(v.ok).toBe(true);
    expect(v.row.calories).toBe(620);
    expect(v.row.protein_g).toBe(40.2);
    expect(v.row.meal_type).toBe('comida');
  });
  it('rechaza fecha/hora/calorías inválidas', () => {
    expect(validateMeal({ date: 'x', time: '14:30', title: 'X', calories: 1 }).ok).toBe(false);
    expect(validateMeal({ date: '2026-07-31', time: '9:5', title: 'X', calories: 1 }).ok).toBe(false);
    expect(validateMeal({ date: '2026-07-31', time: '09:05', title: '', calories: 1 }).ok).toBe(false);
    expect(validateMeal({ date: '2026-07-31', time: '09:05', title: 'X', calories: 99999 }).ok).toBe(false);
  });
});

describe('registrarComidaFoto', () => {
  it('registra usando los NÚMEROS DEL ANÁLISIS (no del modelo) y calcula pendientes', async () => {
    const cap = {};
    const ctx = { profile: {}, today: { pendientes: { kcal: 1000, prot: 100, carb: 120, fat: 50 } } };
    const r = await registrarComidaFoto({
      supabase: fakeSupabase(cap),
      userId: 'u1',
      input: { analisis_id: 'foto', momento: 'cena', correccion: '' },
      analysis,
      ctx,
    });
    expect(r.toolResult.ok).toBe(true);
    expect(cap.row.calories).toBe(620); // del análisis
    expect(cap.row.protein_g).toBe(40);
    expect(cap.row.meal_type).toBe('cena');
    expect(cap.row.image).toBe('abc123.jpg');
    expect(r.toolResult.pendientes_tras.kcal).toBe(380); // 1000 - 620
    expect(r.toolResult.alerta_alergeno).toBe(false);
  });

  it('MARCA el alérgeno declarado en código (no bloquea el registro)', async () => {
    const cap = {};
    const ctx = { profile: { allergies: ['lacteo'] }, today: { pendientes: {} } };
    const r = await registrarComidaFoto({
      supabase: fakeSupabase(cap),
      userId: 'u1',
      input: { analisis_id: 'foto', momento: 'cena', correccion: '' },
      analysis, // contiene 'queso' → lácteo
      ctx,
    });
    expect(r.toolResult.ok).toBe(true); // NO bloquea
    expect(r.toolResult.alerta_alergeno).toBe(true);
    expect(r.toolResult.alergenos).toContain('queso');
  });

  it('devuelve error si no hay análisis', async () => {
    const r = await registrarComidaFoto({ supabase: fakeSupabase({}), userId: 'u1', input: {}, analysis: null, ctx: {} });
    expect(r.toolResult.ok).toBe(false);
  });
});
