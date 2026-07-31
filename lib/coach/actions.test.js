import { describe, it, expect } from 'vitest';
import { validateMeal } from '../meals/insert.js';
import { registrarComidaFoto, registrarTexto, actualizarContextoDia, generarCena } from './actions.js';

// Stub para coach_day_state: `current` = fila de hoy (o null); captura el upsert.
function fakeDayState(current, upsertError = null) {
  const captured = {};
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    maybeSingle() { return Promise.resolve({ data: current }); },
    upsert(row) { captured.row = row; return Promise.resolve({ error: upsertError }); },
  };
  return { _cap: captured, from: () => chain };
}

// Stub del cliente Anthropic: una tool `name` devuelve `input`.
function fakeTool(name, input) {
  return { messages: { create: async () => ({ content: [{ type: 'tool_use', name, input }] }) } };
}
const fakeAnthropic = (estimateInput) => fakeTool('estimar_comida', estimateInput);
const fakeOpciones = (opciones) => fakeTool('proponer_opciones', { opciones });

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

describe('registrarTexto', () => {
  const estimacion = { titulo: '2 tacos de pastor', kcal: 620, prot_g: 40, carb_g: 60, gras_g: 22, ingredientes: ['tortilla', 'cerdo', 'piña'] };

  it('estima y PROPONE (no escribe) con números del grounding', async () => {
    const r = await registrarTexto({
      anthropic: fakeAnthropic(estimacion),
      model: 'm',
      input: { descripcion: '2 tacos de pastor', momento: 'cena' },
      ctx: { profile: {} },
    });
    expect(r.toolResult.ok).toBe(true);
    expect(r.toolResult.estimado).toBe(true);
    expect(r.estimate.kcal).toBe(620);
    expect(r.estimate.momento).toBe('cena');
    expect(r.toolResult.alerta_alergeno).toBe(false);
  });

  it('marca el alérgeno declarado en la estimación', async () => {
    const r = await registrarTexto({
      anthropic: fakeAnthropic({ titulo: 'quesadilla', kcal: 300, prot_g: 15, carb_g: 30, gras_g: 12, ingredientes: ['tortilla', 'queso'] }),
      model: 'm',
      input: { descripcion: 'una quesadilla', momento: 'snack' },
      ctx: { profile: { allergies: ['lacteo'] } },
    });
    expect(r.toolResult.alerta_alergeno).toBe(true);
  });

  it('error si la descripción viene vacía', async () => {
    const r = await registrarTexto({ anthropic: fakeAnthropic({}), model: 'm', input: { descripcion: '', momento: 'comida' }, ctx: {} });
    expect(r.toolResult.ok).toBe(false);
  });
});

describe('actualizarContextoDia', () => {
  it('agua_ml SUMA sobre lo ya tomado hoy', async () => {
    const sb = fakeDayState({ agua_ml: 250, entreno_estado: 'hecho' });
    const r = await actualizarContextoDia({ supabase: sb, userId: 'u1', input: { campo: 'agua_ml', valor: '500' } });
    expect(r.toolResult.ok).toBe(true);
    expect(r.toolResult.agua_ml).toBe(750);
    expect(sb._cap.row.entreno_estado).toBe('hecho'); // preserva otros campos
  });

  it('entreno_estado mapea lenguaje natural a enum', async () => {
    const sb = fakeDayState(null);
    const r = await actualizarContextoDia({ supabase: sb, userId: 'u1', input: { campo: 'entreno_estado', valor: 'ya entrené' } });
    expect(r.toolResult.ok).toBe(true);
    expect(r.toolResult.entreno_estado).toBe('hecho');
  });

  it('rechaza campo o valor inválidos (no escribe)', async () => {
    const bad1 = await actualizarContextoDia({ supabase: fakeDayState(null), userId: 'u1', input: { campo: 'foo', valor: '1' } });
    expect(bad1.toolResult.ok).toBe(false);
    const bad2 = await actualizarContextoDia({ supabase: fakeDayState(null), userId: 'u1', input: { campo: 'agua_ml', valor: 'mucha' } });
    expect(bad2.toolResult.ok).toBe(false);
  });

  it('hora_comida valida HH:MM', async () => {
    const ok = await actualizarContextoDia({ supabase: fakeDayState(null), userId: 'u1', input: { campo: 'hora_comida', valor: '9:05' } });
    expect(ok.toolResult.ok).toBe(true);
    expect(ok.toolResult.hora_comida).toBe('09:05');
  });
});

describe('generarCena', () => {
  const dosOpciones = [
    { titulo: 'Pollo con arroz', kcal: 500, prot_g: 45, carb_g: 55, gras_g: 10, ingredientes: ['pollo', 'arroz'], tiempo_min: 20, costo: '$' },
    { titulo: 'Quesadilla', kcal: 400, prot_g: 18, carb_g: 40, gras_g: 18, ingredientes: ['tortilla', 'queso'], tiempo_min: 10, costo: '$' },
  ];

  it('FILTRA en código las opciones con alérgeno declarado', async () => {
    const r = await generarCena({
      anthropic: fakeOpciones(dosOpciones),
      model: 'm',
      input: { momento: 'cena', n_opciones: 2, usar_favoritos: false, ingredientes_disponibles: [] },
      ctx: { profile: { allergies: ['lacteo'] }, today: { pendientes: { kcal: 500, prot: 45 } } },
    });
    expect(r.toolResult.ok).toBe(true);
    expect(r.opciones).toHaveLength(1); // la quesadilla (queso→lácteo) se descarta
    expect(r.opciones[0].titulo).toBe('Pollo con arroz');
    expect(r.opciones[0].kcal).toBe(500); // números del grounding
  });

  it('respeta n_opciones y devuelve números del grounding', async () => {
    const r = await generarCena({
      anthropic: fakeOpciones(dosOpciones),
      model: 'm',
      input: { momento: 'cena', n_opciones: 1, usar_favoritos: false, ingredientes_disponibles: [] },
      ctx: { profile: {}, today: { pendientes: {} } },
    });
    expect(r.opciones).toHaveLength(1);
  });

  it('si TODAS violan restricciones → sin opciones seguras', async () => {
    const r = await generarCena({
      anthropic: fakeOpciones([dosOpciones[1]]), // solo la quesadilla
      model: 'm',
      input: { momento: 'cena', n_opciones: 2, usar_favoritos: false, ingredientes_disponibles: [] },
      ctx: { profile: { allergies: ['lacteo'] }, today: { pendientes: {} } },
    });
    expect(r.toolResult.ok).toBe(false);
    expect(r.toolResult.error).toBe('sin_opciones_seguras');
  });
});
