import { describe, it, expect } from 'vitest';
import { validateMeal } from '../meals/insert.js';
import { registrarComidaFoto, registrarTexto, actualizarContextoDia, generarCena, cambiarObjetivo, guardarMemoria } from './actions.js';
import { contextoDiaBlock } from './persona.js';
import { localDateTime } from './context.js';

// Stub para coach_memories: captura el upsert.
function fakeMem(upsertError = null) {
  const cap = {};
  return { _cap: cap, from: () => ({ upsert(row, opts) { cap.row = row; cap.opts = opts; return Promise.resolve({ error: upsertError }); } }) };
}

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
          const res = { data: { id: 'm1' }, error };
          // Soporta tanto `await insert(...)` como `insert(...).select('id').single()` (meal_id para gamificación).
          return { select: () => ({ single: () => Promise.resolve(res) }), then: (cb) => Promise.resolve(res).then(cb) };
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

  // FIX farmeo (V2.1): el flujo legítimo SIEMPRE escribe con la fecha de HOY (MX). Como el award de
  // WORKOUT_LOGGED/CHECKIN_COMPLETED se otorga con esa misma `date`, el ref queda anclado a hoy → la
  // validación server-side (otorgar_evento: v_ref = hoy MX) no puede rechazar el flujo real, y no hay
  // camino de cliente para fabricar una fecha pasada/futura desde aquí.
  it('ancla la escritura (y el award) a HOY MX — nunca una fecha fabricada', async () => {
    const sb = fakeDayState(null);
    await actualizarContextoDia({ supabase: sb, userId: 'u1', input: { campo: 'entreno_estado', valor: 'ya entrené' } });
    expect(sb._cap.row.date).toBe(localDateTime().date);
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

describe('cambiarObjetivo (cambia OBJETIVO → recomputa con el motor, sin escribir)', () => {
  const profile = {
    sex: 'male', age: 30, height_cm: 175, weight_kg: 80, activity_pal: 1.55,
    coach: 'perdida_grasa', coach_params: {}, body_fat_pct: null, target_weight_kg: 75,
  };
  const ctx = { profile, targets: { kcal_target: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 } };

  it('propone el antes→después con metas del motor (números, no del modelo)', () => {
    const r = cambiarObjetivo({ ctx, input: { objetivo: 'hipertrofia', nota: 'ganar músculo' } });
    expect(r.toolResult.ok).toBe(true);
    expect(r.planChange.objetivo).toBe('hipertrofia');
    expect(typeof r.planChange.next.kcal_target).toBe('number');
    expect(r.planChange.prev.kcal_target).toBe(2000);
    // el motor no devuelve `warn` dentro de los targets propuestos
    expect(r.planChange.next).not.toHaveProperty('warn');
  });

  it('rechaza objetivo inválido, mismo objetivo y perfil ausente (no escribe)', () => {
    expect(cambiarObjetivo({ ctx, input: { objetivo: 'foo', nota: '' } }).toolResult.ok).toBe(false);
    expect(cambiarObjetivo({ ctx, input: { objetivo: 'perdida_grasa', nota: '' } }).toolResult.error).toBe('mismo_objetivo');
    expect(cambiarObjetivo({ ctx: { profile: null }, input: { objetivo: 'hipertrofia', nota: '' } }).toolResult.ok).toBe(false);
  });
});

describe('guardarMemoria (save_memory) + inyección', () => {
  it('guarda un hecho y hace upsert con dedupe por (user_id,tipo,norm)', async () => {
    const sb = fakeMem();
    const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'rechazo', contenido: 'No me gusta el Brócoli', caducidad_dias: 0 } });
    expect(r.toolResult.ok).toBe(true);
    expect(r.memoria.tipo).toBe('rechazo');
    expect(sb._cap.opts.onConflict).toBe('user_id,tipo,norm');
    expect(sb._cap.row.norm).toBe('no me gusta el brocoli'); // normalizado
    expect(sb._cap.row.caduca_en).toBe(null); // 0 = permanente
  });

  it('caducidad_dias > 0 fija caduca_en (YYYY-MM-DD)', async () => {
    const sb = fakeMem();
    const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'lesion', contenido: 'hombro derecho', caducidad_dias: 14 } });
    expect(r.toolResult.ok).toBe(true);
    expect(sb._cap.row.caduca_en).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('GUARD DE SALUD: no guarda alergia/intolerancia como memoria (no escribe)', async () => {
    const sb = fakeMem();
    const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'preferencia', contenido: 'soy alérgico a los mariscos', caducidad_dias: 0 } });
    expect(r.toolResult.ok).toBe(false);
    expect(r.toolResult.error).toBe('es_salud');
    expect(sb._cap.row).toBeUndefined(); // no hubo upsert
  });

  it('rechaza tipo inválido y contenido vacío', async () => {
    expect((await guardarMemoria({ supabase: fakeMem(), userId: 'u1', input: { tipo: 'x', contenido: 'a', caducidad_dias: 0 } })).toolResult.ok).toBe(false);
    expect((await guardarMemoria({ supabase: fakeMem(), userId: 'u1', input: { tipo: 'favorito', contenido: '', caducidad_dias: 0 } })).toolResult.ok).toBe(false);
  });

  it('la memoria se inyecta en <contexto_dia> (formato [tipo] contenido)', () => {
    const block = contextoDiaBlock({
      today: { pendientes: {} },
      memorias: [{ tipo: 'favorito', contenido: 'café sin azúcar' }, { tipo: 'rechazo', contenido: 'brócoli' }],
    });
    expect(block).toContain('Memoria:');
    expect(block).toContain('[favorito] café sin azúcar');
    expect(block).toContain('[rechazo] brócoli');
  });

  it('sin memorias no añade la línea', () => {
    const block = contextoDiaBlock({ today: { pendientes: {} }, memorias: [] });
    expect(block).not.toContain('Memoria:');
  });
});

describe('guard de salud de save_memory · seguridad crítica (bypass Nielsen)', () => {
  // TODAS deben BLOQUEARSE (dato de salud, no memoria). Dirección segura: over-block.
  const BLOQUEAR = [
    'soy alérgico a los mariscos',
    'no puedo comer gluten',
    'soy celíaco',
    'no puedo comer lácteos',
    'el gluten me cae mal',
    'me hace daño el trigo',
    'sensible al gluten',
    'no tolero los lácteos',
    'el maní me manda al hospital',
    'no como gluten por salud',
    'soy intolerante a la lactosa',
    'el cacahuate me da alergia',
  ];
  for (const frase of BLOQUEAR) {
    it(`BLOQUEA: "${frase}"`, async () => {
      const sb = fakeMem();
      const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'preferencia', contenido: frase, caducidad_dias: 0 } });
      expect(r.toolResult.ok).toBe(false);
      expect(r.toolResult.error).toBe('es_salud');
      expect(sb._cap.row).toBeUndefined(); // nunca escribe
    });
  }

  // Preferencias de GUSTO (no salud) → SÍ se guardan.
  const PERMITIR = ['no me gusta el brócoli', 'no me encanta el pescado', 'no me gusta el gluten', 'prefiero comida rápida', 'me encantan los tacos'];
  for (const frase of PERMITIR) {
    it(`PERMITE (preferencia): "${frase}"`, async () => {
      const sb = fakeMem();
      const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'preferencia', contenido: frase, caducidad_dias: 0 } });
      expect(r.toolResult.ok).toBe(true);
      expect(sb._cap.row).toBeDefined();
    });
  }
});

describe('guard de salud · síntomas con alérgeno sin harm-cue explícito (RE-QA Nielsen)', () => {
  // Deben BLOQUEAR: término de alérgeno + síntoma, aunque no digan "alergia".
  const BLOQUEAR = [
    'el gluten no me sienta',
    'me da diarrea el gluten',
    'el trigo me da colitis',
    'la leche me da gases',
    'el maní me pica la garganta',
    'el gluten me da migraña',
    'no le hago al gluten',
  ];
  for (const frase of BLOQUEAR) {
    it(`BLOQUEA (síntoma): "${frase}"`, async () => {
      const sb = fakeMem();
      const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'rechazo', contenido: frase, caducidad_dias: 0 } });
      expect(r.toolResult.ok).toBe(false);
      expect(r.toolResult.error).toBe('es_salud');
      expect(sb._cap.row).toBeUndefined();
    });
  }

  // Gustos (incluye alérgeno mencionado sin síntoma) → SIN regresión, se guardan.
  const PERMITIR = [
    'no me gusta el gluten', 'no me gustan los mariscos', 'no me gusta el brócoli', 'prefiero pollo a res',
    'no me encanta el pescado', 'me encanta el chocolate', 'soy vegetariano', 'odio la cebolla',
  ];
  for (const frase of PERMITIR) {
    it(`PERMITE (gusto, sin regresión): "${frase}"`, async () => {
      const sb = fakeMem();
      const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'preferencia', contenido: frase, caducidad_dias: 0 } });
      expect(r.toolResult.ok).toBe(true);
      expect(sb._cap.row).toBeDefined();
    });
  }
});

describe('guard de salud · Camino B hermético (adversarial Nielsen: síntomas no enumerados)', () => {
  // Alérgeno + cualquier síntoma/idiom (aunque NO esté enumerado) → SALUD. La lógica
  // invertida (alérgeno + no-gusto) los cubre sin listar cada síntoma.
  const BLOQUEAR = [
    'el gluten me da reflujo', 'el trigo me da acidez', 'el gluten me da comezon',
    'la leche me da ronchas', 'el maní me da sarpullido', 'la leche me da colicos',
    'el gluten me da flatulencia', 'el trigo me da retortijones', 'el marisco me intoxica',
    'el gluten me da indigestion', 'el trigo me da empacho', 'el maní me cierra la garganta',
    'el gluten no me hace bien', 'el gluten me cae pesado', 'el gluten me revienta',
    'la leche me da asco',
  ];
  for (const frase of BLOQUEAR) {
    it(`BLOQUEA (hermético): "${frase}"`, async () => {
      const sb = fakeMem();
      const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'rechazo', contenido: frase, caducidad_dias: 0 } });
      expect(r.toolResult.ok).toBe(false);
      expect(r.toolResult.error).toBe('es_salud');
      expect(sb._cap.row).toBeUndefined();
    });
  }

  // Frases SIN término de alérgeno siguen su ruta normal (se guardan).
  it('sin término de alérgeno → ruta normal (se guarda): "odio la cebolla"', async () => {
    const sb = fakeMem();
    const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'rechazo', contenido: 'odio la cebolla', caducidad_dias: 0 } });
    expect(r.toolResult.ok).toBe(true);
  });
});

describe('guard de salud · colisión gusto+síntoma (rescate solo si gusto LIMPIO)', () => {
  // Verbo de gusto PERO con bloqueador (síntoma/negación/consecuencia) → NO rescata → SALUD.
  const BLOQUEAR = [
    'detesto los mariscos me dan ronchas',
    'prefiero el pan aunque me da acidez',
    'me gusta el gluten pero me da diarrea',
    'odio el camaron me da comezon',
    'prefiero evitar el gluten',
    'me encanta el pan pero me hincha',
  ];
  for (const frase of BLOQUEAR) {
    it(`BLOQUEA (gusto contaminado): "${frase}"`, async () => {
      const sb = fakeMem();
      const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'preferencia', contenido: frase, caducidad_dias: 0 } });
      expect(r.toolResult.ok).toBe(false);
      expect(r.toolResult.error).toBe('es_salud');
      expect(sb._cap.row).toBeUndefined();
    });
  }

  // Gusto LIMPIO (verbo de gusto, sin bloqueador) → se guarda (aunque mencione alérgeno).
  const PERMITIR = ['me gusta el pan', 'me encanta el queso', 'prefiero pollo a res', 'odio la cebolla', 'no me gusta el brócoli', 'soy vegetariano'];
  for (const frase of PERMITIR) {
    it(`PERMITE (gusto limpio): "${frase}"`, async () => {
      const sb = fakeMem();
      const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'preferencia', contenido: frase, caducidad_dias: 0 } });
      expect(r.toolResult.ok).toBe(true);
      expect(sb._cap.row).toBeDefined();
    });
  }
});

describe('guard de salud · Slowking adversarial (A1 reacción abierta / A2 no-alérgeno)', () => {
  const bloquea = async (frase) => {
    const sb = fakeMem();
    const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'favorito', contenido: frase, caducidad_dias: 0 } });
    return r.toolResult.ok === false && r.toolResult.error === 'es_salud' && sb._cap.row === undefined;
  };
  const guarda = async (frase) => {
    const sb = fakeMem();
    const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'favorito', contenido: frase, caducidad_dias: 0 } });
    return r.toolResult.ok === true && sb._cap.row !== undefined;
  };

  // A1: alérgeno + verbo de gusto + reacción NO listada, sin bloqueador literal → SALUD.
  const A1 = [
    'me encanta el maní y se me cierra la garganta',
    'me encanta el camarón y me deja hinchado',
    'me gusta la leche y me deja inflamado',
    'me encanta el trigo y termino con agruras',
    'me encanta el queso y me cae pesado',
    'detesto el maní, me deja la piel ardiendo',
    'me encanta el camarón y se me duerme la boca',
    'me gusta el camarón y termino en el baño',
  ];
  for (const f of A1) it(`A1 BLOQUEA: "${f}"`, async () => expect(await bloquea(f)).toBe(true));

  // Controles (deben bloquear) + A3 mayúsculas/acentos + A2 sin alérgeno.
  const OTROS_BLOQUEAN = [
    'me encantan las nueces y me sale un salpullido',
    'me encanta el trigo y me da comezón',
    'me encanta el camarón y me brota urticaria',
    'ME ENCANTA EL MANÍ Y SE ME CIERRA LA GARGANTA', // A3
    'el aguacate me deja mareado', // A2 (sin alérgeno)
    'el kiwi me pica la boca', // A2
    'la fresa me revienta el estómago', // A2
  ];
  for (const f of OTROS_BLOQUEAN) it(`BLOQUEA: "${f}"`, async () => expect(await bloquea(f)).toBe(true));

  // Gustos COMPUESTOS legítimos (dos alérgenos, SIN reacción) → DEBEN guardarse (no over-block).
  const COMPUESTOS = [
    'me encanta el camarón y la langosta',
    'me gusta el queso y el pan',
    'prefiero el pescado a la carne',
    'prefiero la leche deslactosada',
    'me gusta el pan tostado',
  ];
  for (const f of COMPUESTOS) it(`GUARDA (gusto compuesto): "${f}"`, async () => expect(await guarda(f)).toBe(true));
});

describe('guard de salud · Opción A estructural (Slowking re-fuzz: allowlist comida)', () => {
  const bloquea = async (f) => {
    const sb = fakeMem();
    const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'favorito', contenido: f, caducidad_dias: 0 } });
    return r.toolResult.ok === false && r.toolResult.error === 'es_salud' && sb._cap.row === undefined;
  };
  const guarda = async (f) => {
    const sb = fakeMem();
    const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'favorito', contenido: f, caducidad_dias: 0 } });
    return r.toolResult.ok === true && sb._cap.row !== undefined;
  };

  // FRESH: alérgeno + gusto + reacción REFRASEADA (verbo/patrón fuera de toda lista) → SALUD.
  const FRESH = [
    'me encanta el maní y siento que me ahogo',
    'me encanta el camarón y ando mal del estómago',
    'me encanta la leche y vivo inflamado',
    'me encanta el maní y se hincha mi lengua',
    'me encanta el maní y me hincho todo',
    'me encanta el queso y luego no respiro bien',
    'me encanta el trigo y amanezco pesado',
    'me encanta el camarón y quedo morado',
    'me encanta el camarón y acabo rascándome',
    'me encanta el maní y la lengua se me duerme',
  ];
  for (const f of FRESH) it(`BLOQUEA (reacción abierta): "${f}"`, async () => expect(await bloquea(f)).toBe(true));

  // Compuestos de COMIDA (con adjetivo / "a la" / "al") → GUARDAN (0 over-block).
  const COMIDA = [
    'me encanta el camarón y la langosta',
    'me gusta el queso y el pan',
    'me encanta el camarón a la diabla',
    'me encanta el queso y el pan integral',
    'prefiero el atún al salmón',
  ];
  for (const f of COMIDA) it(`GUARDA (comida compuesta): "${f}"`, async () => expect(await guarda(f)).toBe(true));

  // Gustos puros del re-fuzz (deben GUARDAR).
  const PUROS = ['me encanta el camarón', 'odio las nueces', 'no me gusta el camarón'];
  for (const f of PUROS) it(`GUARDA (puro): "${f}"`, async () => expect(await guarda(f)).toBe(true));

  // Regresión salud enumerada del re-fuzz (deben BLOQUEAR).
  const SALUD = [
    'soy alérgico a los camarones', 'el gluten me da diarrea', 'no puedo comer maní', 'soy celíaco',
    'el queso me da migraña', 'los mariscos me dan ronchas', 'el camarón me manda al hospital',
  ];
  for (const f of SALUD) it(`BLOQUEA (salud enumerada): "${f}"`, async () => expect(await bloquea(f)).toBe(true));
});

describe('guard de salud · Slowking ronda 3 (síntoma-sustantivo + sin-conector)', () => {
  const bloquea = async (f) => {
    const sb = fakeMem();
    const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'favorito', contenido: f, caducidad_dias: 0 } });
    return r.toolResult.ok === false && r.toolResult.error === 'es_salud' && sb._cap.row === undefined;
  };
  const guarda = async (f) => {
    const sb = fakeMem();
    const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'favorito', contenido: f, caducidad_dias: 0 } });
    return r.toolResult.ok === true && sb._cap.row !== undefined;
  };

  // (a) síntoma disfrazado de comida (determinante + sustantivo) → SALUD.
  const VECTOR_A = [
    'me encanta el maní y la diarrea', 'me encanta el maní y la comezón', 'me encanta el maní y las ronchas',
    'me encanta el maní y la hinchazón', 'me encanta el maní y la picazón', 'me encanta el camarón y el ardor',
    'me encanta la leche y la inflamación', 'me encanta el maní y el salpullido', 'me encanta el camarón y la erupción',
    'me encanta el maní y la asfixia',
  ];
  // (b) sin conector / conector raro (; -).
  const VECTOR_B = [
    'me encanta el maní me ahogo', 'me encanta el maní me hincho', 'me encanta el camarón quedo morado',
    'me encanta la leche vivo inflamado', 'me encanta el maní; me ahogo', 'me encanta el maní - me ahogo',
    'me encanta el maní se me cierra la garganta',
  ];
  // (c) mayús/acentos, ' e ', múltiples.
  const VECTOR_C = [
    'ME ENCANTA EL MANÍ Y LA HINCHAZÓN', 'me encanta el maní e la hinchazón',
    'me encanta el maní y la almendra y me ahogo', 'me encanta el camarón y la langosta y la hinchazón',
  ];
  for (const f of [...VECTOR_A, ...VECTOR_B, ...VECTOR_C]) {
    it(`BLOQUEA: "${f}"`, async () => expect(await bloquea(f)).toBe(true));
  }

  // Compuestos/puros del re-fuzz que DEBEN seguir guardándose (0 over-block).
  const GUARDAN = [
    'me encanta el camarón y la langosta', 'me gusta el queso y el pan', 'me encanta el queso y el pan integral',
    'prefiero el atún al salmón', 'me encanta el camarón a la diabla', 'me encanta el camarón',
    'odio las nueces', 'prefiero la leche deslactosada',
  ];
  for (const f of GUARDAN) it(`GUARDA: "${f}"`, async () => expect(await guarda(f)).toBe(true));
});

describe('guard de salud · Slowking ronda 4 (singular/slang + over-block té con leche)', () => {
  const bloquea = async (f) => {
    const sb = fakeMem();
    const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'favorito', contenido: f, caducidad_dias: 0 } });
    return r.toolResult.ok === false && r.toolResult.error === 'es_salud' && sb._cap.row === undefined;
  };
  const guarda = async (f) => {
    const sb = fakeMem();
    const r = await guardarMemoria({ supabase: sb, userId: 'u1', input: { tipo: 'favorito', contenido: f, caducidad_dias: 0 } });
    return r.toolResult.ok === true && sb._cap.row !== undefined;
  };

  // Singular + slang/mala grafía → BLOQUEAN.
  const BLOQUEAR = [
    'me encanta el maní y la roncha', 'me encanta el maní y el sarpuyido', 'me encanta el maní y la rasquera',
    'me encanta el maní y el escozor', 'me encanta el maní y la ampolla', 'me encanta el maní y el salpuyido',
  ];
  for (const f of BLOQUEAR) it(`BLOQUEA (singular/slang): "${f}"`, async () => expect(await bloquea(f)).toBe(true));

  // Over-block corregido: bebidas con "té/café con leche" → GUARDAN.
  const GUARDAR = ['me encanta el té con leche', 'me encanta el café con leche'];
  for (const f of GUARDAR) it(`GUARDA (té/café con leche): "${f}"`, async () => expect(await guarda(f)).toBe(true));
});
