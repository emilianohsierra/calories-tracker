// Ejecutores de las tools de acción del coach (Fase 1 R3). Cada ejecutor corre en el
// backend, REUSA la lógica existente y usa números del MOTOR/BD o del análisis de visión
// —NUNCA del modelo—. El filtro de alérgenos es CÓDIGO (no prompt).
import { validateMeal } from '../meals/insert';
import { findViolations, ALLERGEN_TERMS } from './allergens';
import { localDateTime } from './context';
import { computeTargets } from '../nutrition/compute';
import { COACH_IDS } from '../nutrition/coaches';

const MOMENTOS = ['desayuno', 'comida', 'cena', 'snack'];

// cambiar_plan (corregido, Opción A del Director): cambia el OBJETIVO/coach y RECALCULA
// las metas con el MOTOR determinista (computeTargets). NO escribe: PROPONE el antes→
// después; la mutación real es al confirmar en UI (POST /api/profile). Sin override manual
// de macros — el motor es la única vía a los targets (coherencia + seguridad/topes).
export function cambiarObjetivo({ ctx, input }) {
  const objetivo = COACH_IDS.includes(input?.objetivo) ? input.objetivo : null;
  if (!objetivo) return { toolResult: { ok: false, error: 'objetivo_invalido' } };
  const profile = ctx?.profile;
  if (!profile || !profile.coach) return { toolResult: { ok: false, error: 'sin_perfil' } };
  if (profile.coach === objetivo) return { toolResult: { ok: false, error: 'mismo_objetivo', objetivo } };

  // Fusiona el perfil con el coach nuevo. Params faltantes: computeTargets aplica los
  // DEFAULT SEGUROS de cada coach y enforce los topes (déficits/pisos). Nada arbitrario.
  const perfil_merged = { ...profile, coach: objetivo };
  let next;
  try {
    next = computeTargets(perfil_merged);
  } catch (e) {
    console.error('cambiar_plan computeTargets:', e?.message);
    return { toolResult: { ok: false, error: 'compute' } };
  }
  const { warn, ...nextTargets } = next;
  const prev = ctx?.targets || null;

  return {
    planChange: { objetivo, prev, next: nextTargets },
    toolResult: {
      ok: true,
      objetivo,
      antes: prev ? { kcal: prev.kcal_target, prot: prev.protein_g, carb: prev.carbs_g, gras: prev.fat_g } : null,
      despues: { kcal: nextTargets.kcal_target, prot: nextTargets.protein_g, carb: nextTargets.carbs_g, gras: nextTargets.fat_g },
      warn: warn || '',
      nota: 'Propuesta de cambio de objetivo; se aplica solo si la persona confirma.',
    },
  };
}

// Tool de estimación (grounding): produce los macros de una comida descrita en texto.
// Es una llamada SEPARADA del chat → los números salen de aquí, no del modelo del chat
// (Karpathy §4.3). Se marcan como "estimado".
const ESTIMAR_TOOL = {
  name: 'estimar_comida',
  description: 'Estima kcal y macros de la porción TOTAL de una comida descrita en texto. Valores realistas (México).',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['titulo', 'kcal', 'prot_g', 'carb_g', 'gras_g', 'ingredientes'],
    properties: {
      titulo: { type: 'string' },
      kcal: { type: 'number' },
      prot_g: { type: 'number' },
      carb_g: { type: 'number' },
      gras_g: { type: 'number' },
      ingredientes: { type: 'array', items: { type: 'string' } },
    },
  },
};

const nOr0 = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);

// Llamada de grounding: estima una comida a partir de su descripción. Devuelve null si falla.
export async function estimarComida({ anthropic, model, descripcion }) {
  const r = await anthropic.messages.create({
    model,
    max_tokens: 400,
    system:
      'Eres un estimador de macros de comida en español (México). Estima valores realistas para la porción TOTAL descrita. Responde SIEMPRE llamando la herramienta estimar_comida; no expliques.',
    tools: [ESTIMAR_TOOL],
    tool_choice: { type: 'tool', name: 'estimar_comida' },
    messages: [{ role: 'user', content: `Comida descrita: "${descripcion}". Estima kcal y macros de la porción total.` }],
  });
  const tb = (r?.content || []).find((b) => b.type === 'tool_use' && b.name === 'estimar_comida');
  if (!tb?.input || typeof tb.input !== 'object') return null;
  return {
    titulo: String(tb.input.titulo || descripcion).trim().slice(0, 120),
    kcal: Math.round(nOr0(tb.input.kcal)),
    prot_g: Math.round(nOr0(tb.input.prot_g)),
    carb_g: Math.round(nOr0(tb.input.carb_g)),
    gras_g: Math.round(nOr0(tb.input.gras_g)),
    ingredientes: Array.isArray(tb.input.ingredientes)
      ? tb.input.ingredientes.slice(0, 20).map((s) => String(s).slice(0, 60))
      : [],
  };
}

// Tool interna de generación: propone opciones de comida que cierran los pendientes.
// Llamada SEPARADA (grounding) → los números salen de aquí, no del modelo del chat.
const PROPONER_TOOL = {
  name: 'proponer_opciones',
  description: 'Propone opciones de comida realistas (México) que cubran los macros pendientes ±10%, respetando restricciones y preferencias.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['opciones'],
    properties: {
      opciones: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['titulo', 'kcal', 'prot_g', 'carb_g', 'gras_g', 'ingredientes', 'tiempo_min', 'costo'],
          properties: {
            titulo: { type: 'string' },
            kcal: { type: 'number' },
            prot_g: { type: 'number' },
            carb_g: { type: 'number' },
            gras_g: { type: 'number' },
            ingredientes: { type: 'array', items: { type: 'string' } },
            tiempo_min: { type: 'number' },
            costo: { type: 'string' },
          },
        },
      },
    },
  },
};

async function proponerOpciones({ anthropic, model, prompt }) {
  const r = await anthropic.messages.create({
    model,
    max_tokens: 700,
    system:
      'Eres un generador de opciones de comida en español (México). Genera opciones realistas que cubran los macros pendientes (±10%), respetando SIEMPRE las restricciones duras (NUNCA incluyas un alérgeno/ingrediente prohibido), el país, el presupuesto y el tiempo. Responde SIEMPRE con la herramienta proponer_opciones; no expliques.',
    tools: [PROPONER_TOOL],
    tool_choice: { type: 'tool', name: 'proponer_opciones' },
    messages: [{ role: 'user', content: prompt }],
  });
  const tb = (r?.content || []).find((b) => b.type === 'tool_use' && b.name === 'proponer_opciones');
  if (!tb?.input || !Array.isArray(tb.input.opciones)) return null;
  return tb.input.opciones.slice(0, 3).map((o) => ({
    titulo: String(o.titulo || '').trim().slice(0, 120),
    kcal: Math.round(nOr0(o.kcal)),
    prot_g: Math.round(nOr0(o.prot_g)),
    carb_g: Math.round(nOr0(o.carb_g)),
    gras_g: Math.round(nOr0(o.gras_g)),
    ingredientes: Array.isArray(o.ingredientes) ? o.ingredientes.slice(0, 20).map((s) => String(s).slice(0, 60)) : [],
    tiempo_min: Math.round(nOr0(o.tiempo_min)),
    costo: String(o.costo || '').slice(0, 20),
  }));
}

// generar_cena (Karpathy §4.1): sugiere 1–3 opciones que cierran los pendientes. FILTRO
// DURO de alérgenos EN CÓDIGO (belt-and-suspenders sobre el prompt). No muta: cada opción
// se registra al confirmar (MealCard → POST /api/meals). Números del grounding (estimado).
export async function generarCena({ anthropic, model, input, ctx }) {
  const momento = MOMENTOS.includes(input?.momento) ? input.momento : 'cena';
  const n = [1, 2, 3].includes(input?.n_opciones) ? input.n_opciones : 2;
  const disponibles = Array.isArray(input?.ingredientes_disponibles)
    ? input.ingredientes_disponibles.slice(0, 20).map((s) => String(s).slice(0, 40)).filter(Boolean)
    : [];
  const usarFav = !!input?.usar_favoritos;
  const p = ctx?.profile || {};
  const pend = ctx?.today?.pendientes || {};
  const restr = [...(p.allergies || []), ...(p.intolerances || []), ...(Array.isArray(p.no_consume) ? p.no_consume : [])];

  const prompt =
    `Momento: ${momento}. Genera ${n} opción(es).\n` +
    `Macros PENDIENTES de hoy (cúbrelas ±10%): ${pend.kcal ?? 0} kcal · P ${pend.prot ?? 0} g · C ${pend.carb ?? 0} g · G ${pend.fat ?? 0} g.\n` +
    (restr.length ? `RESTRICCIONES DURAS (NUNCA incluir): ${restr.join(', ')}.\n` : '') +
    (p.country ? `País: ${p.country}.\n` : '') +
    (disponibles.length ? `Usa SOLO estos ingredientes disponibles: ${disponibles.join(', ')}.\n` : '') +
    (usarFav && p.favorites ? `Prioriza favoritos: ${Array.isArray(p.favorites) ? p.favorites.join(', ') : p.favorites}.\n` : '') +
    `Cada opción: título, kcal, macros, ingredientes, tiempo_min y costo aproximado.`;

  const opciones = await proponerOpciones({ anthropic, model, prompt });
  if (!opciones || !opciones.length) return { toolResult: { ok: false, error: 'sin_opciones' } };

  // FILTRO DURO en CÓDIGO: descarta cualquier opción con un ingrediente restringido.
  const seguras = opciones.filter((o) => findViolations(o.ingredientes, restr).length === 0).slice(0, n);
  if (!seguras.length) return { toolResult: { ok: false, error: 'sin_opciones_seguras' } };

  return {
    opciones: seguras,
    toolResult: { ok: true, estimado: true, n: seguras.length, momento, nota: 'Opciones estimadas; se registran cuando la persona elija una y confirme.' },
  };
}

// save_memory (Karpathy §4.7): guarda un hecho permanente/curado de la persona (favorito,
// rechazo, lesión, compromiso, preferencia, hecho_clave). GUARD DE SALUD DURO: NUNCA
// guarda alergias/intolerancias como memoria suelta — se derivan al flujo de restricciones
// duras (con confirmación), que está bloqueado hasta el diseño hermético del filtro.
const MEM_TIPOS = ['favorito', 'rechazo', 'lesion', 'compromiso', 'preferencia', 'hecho_clave'];

function normMem(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// GUARD DE SALUD (barrera crítica, HERMÉTICO POR DISEÑO — Camino B). Decide si un texto es
// un dato de SALUD (alergia/intolerancia/condición) que NUNCA debe guardarse como memoria.
// Corre SIEMPRE sobre texto NORMALIZADO (sin acentos → "celíaco"→"celiaco").
// LÓGICA INVERTIDA (no enumera síntomas, imposible de listar): es_salud si
//   (A) hay una señal de salud explícita, O
//   (B) el texto menciona CUALQUIER término de alérgeno Y NO es una expresión de GUSTO/
//       identidad explícita (allow-list positivo). Alérgeno + gusto → preferencia (se
//       guarda); alérgeno + cualquier otra cosa (síntoma/daño/negación/idiom) → SALUD.
// Frases SIN término de alérgeno siguen su ruta normal. Over-block aceptado (seguro > preciso).
// Síntomas/reacciones (normalizados sin acentos). Doble cinturón: van en HEALTH_SIGNALS
// (clause A, gana siempre) Y en los bloqueadores del rescate a gusto.
// Sustantivos de síntoma/reacción (Slowking FUGA-1): disfrazables de "comida" (determinante +
// sustantivo, p.ej. "y la hinchazón"). Se rechazan en la continuación Y van a SINTOMAS →
// clause A los caza en cualquier parte (cinturón). Vocabulario acotado y estructural.
const NO_COMIDA_NOUN = [
  'hinchazon', 'inflamacion', 'picazon', 'comezon', 'ardor', 'mareo', 'salpullido', 'sarpullido', 'erupcion',
  'asfixia', 'ahogo', 'sofoco', 'malestar', 'urticaria', 'ronchas', 'diarrea', 'nausea', 'vomito', 'colico',
  'reflujo', 'acidez', 'agruras',
];
const SINTOMAS = [
  ...new Set([
    'diarrea', 'ronchas', 'colicos', 'gases', 'migrana', 'acidez', 'reflujo', 'comezon', 'retortijones',
    'flatulencia', 'intoxica', 'empacho', 'sarpullido', 'urticaria', 'nausea', 'vomito', 'asco', 'indigestion',
    ...NO_COMIDA_NOUN,
  ]),
];
// A2 (Slowking): señales de reacción CONCRETAS → clause A (bloquean aunque no haya un
// término de alérgeno; mitigación parcial del "alimento no-alérgeno + reacción").
const REACCIONES_A2 = [
  'se me cierra', 'se me duerme', 'me pica la boca', 'me revienta', 'agruras', 'me cae pesado',
  'me deja hinchado', 'me deja inflamado', 'me deja mareado', 'me arde',
];
const HEALTH_SIGNALS = [
  'alergi', 'alergic', 'anafila', 'intoleran', 'no tolero', 'no lo tolero', 'no los tolero', 'no las tolero',
  'celiac', 'celiaqu', 'sensible a', 'sensibilidad a', 'me cae mal', 'me caen mal',
  'me hace dano', 'me hacen dano', 'me hace mal', 'me hacen mal', 'me inflama', 'me hincha', 'me enferma',
  'me manda al hospital', 'me da reaccion', 'reaccion alergic', 'no puedo comer', 'no debo comer',
  'no puedo consumir', 'no debo consumir', 'no puedo tomar', 'por salud', 'me da alergia', 'prohibido por',
  ...SINTOMAS, ...REACCIONES_A2,
];
// Allow-list POSITIVO de gusto/identidad (normalizado). "me gusta" cubre "no me gusta" y
// "me gustan"; "me encanta" cubre "no me encanta"/"me encantan" (substring).
const GUSTO_ALLOW = [
  'me gusta', 'me encanta', 'prefiero', 'odio', 'detesto',
  'soy vegetariano', 'soy vegano', 'dieta vegetariana', 'dieta vegana',
];
// CONTAMINANTES del rescate (Slowking A1): las reacciones son vocabulario ABIERTO. El rescate
// a gusto se bloquea SOLO cuando aparece un marcador de CONSECUENCIA/REACCIÓN (no por un ' y '
// o una coma sueltos — eso sobre-bloquearía gustos compuestos legítimos como "me encanta el
// camarón y la langosta"). Patrones de reacción + conectores de consecuencia + negación previa.
const CONTAMINANTES = [
  'porque', 'aunque', 'pero ', // conectores de CONSECUENCIA (no ' y '/coma neutros)
  'se me ', 'me deja ', 'me queda ', 'me pone ', 'me sale ', 'me salen', 'me da ', 'me dan ', 'me pica', 'me arde',
  'termino ', 'acabo ', // patrones de reacción abiertos + eufemismos
  'evito', 'evitar', 'no como', 'no puedo', 'no debo', 'reaccion', ...SINTOMAS, // negación/evitación previos
];

// Opción A estructural (Slowking, 3ª confirmación): las reacciones son vocabulario ABIERTO
// → imposible enumerarlas. Se invierte a ALLOWLIST del patrón SEGURO: cuando un gusto+alérgeno
// tiene un conector (' y ', ' e ', coma), el rescate es default-DENY; SOLO se salva si CADA
// continuación es CLARAMENTE otra COMIDA = determinante (el/la/los/las/un/una/unos/unas) +
// sustantivo, y SIN pronombre/verbo de estado (me/se/te/le/siento/ando/vivo/quedo/amanezco/
// estoy/acabo/termino/sufro/luego/no). Así "y la langosta" se salva; "y se hincha mi lengua",
// "y vivo inflamado", "y luego no respiro" → SALUD.
const DETERMINANTE_COMIDA = /^(el|la|los|las|un|una|unos|unas)\s+\S+/;
const NO_ES_COMIDA = /\b(me|se|te|le|siento|ando|vivo|quedo|amanezco|estoy|acabo|termino|sufro|luego|no)\b/;
function esContinuacionComida(seg) {
  return (
    DETERMINANTE_COMIDA.test(seg) &&
    !NO_ES_COMIDA.test(seg) &&
    !NO_COMIDA_NOUN.some((w) => seg.includes(w)) // "y la hinchazón" NO es comida (FUGA-1)
  );
}
// Frases de gusto a QUITAR para evaluar "el resto" (FUGA-2 sin conector). Orden largo→corto
// para que "no me gusta" se elimine entero (evita que quede "no" suelto → falso positivo).
const GUSTO_REMOVE = [
  'no me gustan', 'no me encantan', 'no me gusta', 'no me encanta',
  'me gustan', 'me encantan', 'me gusta', 'me encanta',
  'dieta vegetariana', 'dieta vegana', 'soy vegetariano', 'soy vegano', 'prefiero', 'detesto', 'odio',
];
function restoSinGusto(n) {
  let r = ` ${n} `;
  for (const g of GUSTO_REMOVE) r = r.split(g).join(' ');
  return r;
}

function esDatoDeSalud(contenido) {
  const n = normMem(contenido);
  if (!n) return false;
  if (HEALTH_SIGNALS.some((p) => n.includes(p))) return true; // clause A (incl. sustantivos de síntoma)
  const hasAllergen = ALLERGEN_TERMS.some((t) => t.length >= 3 && n.includes(t));
  if (!hasAllergen) return false;
  // Alérgeno sin verbo de gusto → SALUD (default alérgeno→salud).
  if (!GUSTO_ALLOW.some((g) => n.includes(g))) return true;
  // Reacción/negación SIN conector (o pegada) → SALUD.
  if (CONTAMINANTES.some((c) => n.includes(c))) return true;
  // Con conector/delimitador (FIX 2i: + ; . -): default-DENY; solo se rescata si TODA
  // continuación es comida.
  const partes = n.split(/\s+y\s+|\s+e\s+|[,;.\-]/).map((s) => s.trim()).filter(Boolean);
  for (let i = 1; i < partes.length; i++) {
    if (!esContinuacionComida(partes[i])) return true; // continuación no-comida → SALUD
  }
  // FIX 2ii: reacción SIN conector ("me encanta el maní me ahogo"). Quitada la frase de
  // gusto, si el RESTO trae pronombre/verbo de estado o sustantivo de síntoma → SALUD.
  const resto = restoSinGusto(n);
  if (NO_ES_COMIDA.test(resto) || NO_COMIDA_NOUN.some((w) => resto.includes(w))) return true;
  return false; // gusto puro o compuesto de comidas → preferencia (se guarda)
}
function addDaysStr(dateStr, dias) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

export async function guardarMemoria({ supabase, userId, input }) {
  const tipo = MEM_TIPOS.includes(input?.tipo) ? input.tipo : null;
  if (!tipo) return { toolResult: { ok: false, error: 'tipo_invalido' } };
  const contenido = String(input?.contenido || '').trim().slice(0, 200);
  if (!contenido) return { toolResult: { ok: false, error: 'sin_contenido' } };
  // GUARD DE SALUD: alergia/intolerancia/condición NO es memoria suelta (barrera crítica).
  if (esDatoDeSalud(contenido)) {
    return {
      toolResult: {
        ok: false,
        error: 'es_salud',
        nota: 'Eso suena a un tema de salud (alergia/intolerancia): va a tus restricciones con confirmación, no a la memoria.',
      },
    };
  }
  const dias = Number(input?.caducidad_dias);
  let caduca_en = null;
  if (Number.isFinite(dias) && dias > 0) {
    const { date } = localDateTime();
    caduca_en = addDaysStr(date, Math.min(Math.round(dias), 3650));
  }
  const row = {
    user_id: userId,
    tipo,
    contenido,
    norm: normMem(contenido),
    activa: true,
    caduca_en,
    fuente: 'save_memory',
    updated_at: new Date().toISOString(),
  };
  // Upsert por (user_id, tipo, norm): dedupe hermético (re-guardar el mismo hecho actualiza).
  const { error } = await supabase.from('coach_memories').upsert(row, { onConflict: 'user_id,tipo,norm' });
  if (error) {
    console.error('save_memory upsert:', error.message);
    return { toolResult: { ok: false, error: 'db' } };
  }
  return { memoria: { tipo, contenido }, toolResult: { ok: true, tipo, contenido, caduca_en } };
}

// actualizar_contexto_dia (Karpathy §4.5): actualiza un dato del estado de HOY que la
// persona menciona (agua, entreno, sueño, estrés, hora de comida). NO sugiere comida →
// sin filtro de alérgenos. Escribe en coach_day_state (upsert que preserva otros campos).
const CAMPOS = ['agua_ml', 'entreno_estado', 'sueno_h', 'estres', 'hora_comida'];
const ENTRENO = ['pendiente', 'hecho', 'omitido'];
const ESTRES = ['bajo', 'medio', 'alto'];

// Parsea/valida `valor` (string del modelo) según el campo. Devuelve null si es inválido.
function parseCampoValor(campo, valorRaw) {
  const valor = String(valorRaw ?? '').trim().toLowerCase();
  if (campo === 'agua_ml') {
    const n = parseInt(valor.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) && n > 0 && n <= 5000 ? n : null; // ml que ACABA de tomar
  }
  if (campo === 'sueno_h') {
    const n = parseFloat(valor.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 && n <= 24 ? Math.round(n * 10) / 10 : null;
  }
  if (campo === 'entreno_estado') {
    if (ENTRENO.includes(valor)) return valor;
    if (/(hech|termin|complet|ya (entren|hice)|hice)/.test(valor)) return 'hecho';
    if (/(omit|no (entren|voy)|salt)/.test(valor)) return 'omitido';
    if (/(pend|luego|después|despues)/.test(valor)) return 'pendiente';
    return null;
  }
  if (campo === 'estres') {
    if (ESTRES.includes(valor)) return valor;
    if (/(alto|much|estres|tenso|ansios)/.test(valor)) return 'alto';
    if (/(bajo|tranquil|relaj|calma)/.test(valor)) return 'bajo';
    if (/(medio|normal|regular)/.test(valor)) return 'medio';
    return null;
  }
  if (campo === 'hora_comida') {
    const m = valor.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = +m[1];
    const mi = +m[2];
    return h < 24 && mi < 60 ? `${String(h).padStart(2, '0')}:${m[2]}` : null;
  }
  return null;
}

export async function actualizarContextoDia({ supabase, userId, input }) {
  const campo = CAMPOS.includes(input?.campo) ? input.campo : null;
  if (!campo) return { toolResult: { ok: false, error: 'campo_invalido' } };
  const valor = parseCampoValor(campo, input?.valor);
  if (valor === null) return { toolResult: { ok: false, error: 'valor_invalido' } };
  const { date } = localDateTime();

  // Lee el registro de hoy para preservar los demás campos (upsert de payload parcial en
  // PostgREST reescribiría a default los campos ausentes).
  const { data: cur } = await supabase
    .from('coach_day_state')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  const row = {
    user_id: userId,
    date,
    agua_ml: cur?.agua_ml ?? 0,
    entreno_estado: cur?.entreno_estado ?? null,
    sueno_h: cur?.sueno_h ?? null,
    estres: cur?.estres ?? null,
    hora_comida: cur?.hora_comida ?? null,
    updated_at: new Date().toISOString(),
  };
  // agua = evento incremental (ml que acaba de tomar); el resto es valor absoluto.
  if (campo === 'agua_ml') row.agua_ml = (cur?.agua_ml ?? 0) + valor;
  else row[campo] = valor;

  const { error } = await supabase.from('coach_day_state').upsert(row, { onConflict: 'user_id,date' });
  if (error) {
    console.error('actualizar_contexto_dia upsert:', error.message);
    return { toolResult: { ok: false, error: 'db' } };
  }

  return {
    estado: { agua_ml: row.agua_ml, entreno_estado: row.entreno_estado, sueno_h: row.sueno_h, estres: row.estres, hora_comida: row.hora_comida },
    toolResult: { ok: true, campo, valor, agua_ml: row.agua_ml, entreno_estado: row.entreno_estado, sueno_h: row.sueno_h, estres: row.estres, hora_comida: row.hora_comida },
  };
}

// registrar_texto (Karpathy §4.3): estima la comida descrita y la PROPONE (no escribe).
// La mutación real ocurre en UI al confirmar (POST /api/meals) — confirmación antes de
// mutar (requisito del Director). Marca alérgeno en código (aviso).
export async function registrarTexto({ anthropic, model, input, ctx }) {
  const descripcion = String(input?.descripcion || '').trim().slice(0, 300);
  if (!descripcion) return { toolResult: { ok: false, error: 'sin_descripcion' } };
  const momento = MOMENTOS.includes(input?.momento) ? input.momento : 'comida';
  const est = await estimarComida({ anthropic, model, descripcion });
  if (!est) return { toolResult: { ok: false, error: 'sin_estimacion' } };

  const restr = [...(ctx?.profile?.allergies || []), ...(ctx?.profile?.intolerances || [])];
  const alergenos = findViolations(est.ingredientes, restr);

  return {
    estimate: { ...est, momento },
    toolResult: {
      ok: true,
      estimado: true,
      titulo: est.titulo,
      kcal: est.kcal,
      momento,
      alerta_alergeno: alergenos.length > 0,
      alergenos,
      nota: 'Números estimados; se registran cuando la persona confirme.',
    },
  };
}

// registrar_comida_foto (Karpathy §4.2): guarda una comida a partir de un análisis de
// foto YA realizado (flujo de visión existente /api/analyze). Los macros salen del
// análisis, no del chat. El registro NO se bloquea por alérgeno, pero se MARCA (aviso).
export async function registrarComidaFoto({ supabase, userId, input, analysis, ctx }) {
  if (!analysis || typeof analysis !== 'object') {
    return { toolResult: { ok: false, error: 'sin_analisis' } };
  }
  const momento = MOMENTOS.includes(input?.momento)
    ? input.momento
    : MOMENTOS.includes(analysis.tipo_comida)
      ? analysis.tipo_comida
      : 'comida';
  const correccion = String(input?.correccion || '').trim().slice(0, 200);
  const ingredientes = Array.isArray(analysis.ingredientes) ? analysis.ingredientes : [];
  const { date, time } = localDateTime();

  // Reusa validateMeal (misma validación/coerción que /api/meals). Números del análisis.
  const v = validateMeal({
    date,
    time,
    title: analysis.titulo || 'Comida',
    description: correccion
      ? `${analysis.descripcion || ''} (corrección: ${correccion})`.trim()
      : analysis.descripcion || '',
    meal_type: momento,
    calories: analysis.calorias,
    protein_g: analysis.proteinas_g,
    carbs_g: analysis.carbohidratos_g,
    fat_g: analysis.grasas_g,
    ingredients: ingredientes,
    confidence: analysis.confianza,
    image: analysis.imagen,
  });
  if (!v.ok) return { toolResult: { ok: false, error: v.error } };

  // Filtro DURO de alérgenos EN CÓDIGO: el registro no se bloquea (la persona registra
  // lo que comió), pero se marca si viola una restricción declarada.
  const restr = [...(ctx?.profile?.allergies || []), ...(ctx?.profile?.intolerances || [])];
  const alergenos = findViolations(ingredientes, restr);

  const { error } = await supabase.from('meals').insert({ user_id: userId, ...v.row });
  if (error) {
    console.error('registrar_comida_foto insert:', error.message);
    return { toolResult: { ok: false, error: 'db' } };
  }

  // Pendientes tras registrar (motor/BD): pendientes_antes − macros de esta comida.
  const before = ctx?.today?.pendientes || {};
  const pendientes_tras = {
    kcal: Math.round((before.kcal ?? 0) - v.row.calories),
    prot: Math.round((before.prot ?? 0) - v.row.protein_g),
    carb: Math.round((before.carb ?? 0) - v.row.carbs_g),
    fat: Math.round((before.fat ?? 0) - v.row.fat_g),
  };

  return {
    guardado: { titulo: v.row.title, kcal: v.row.calories, prot: v.row.protein_g, momento },
    toolResult: {
      ok: true,
      titulo: v.row.title,
      kcal: v.row.calories,
      prot_g: v.row.protein_g,
      momento,
      alerta_alergeno: alergenos.length > 0,
      alergenos,
      pendientes_tras,
    },
  };
}
