// Coach · Educación Fase B.5 — POST-CHECK EDUCATIVO (backstop de la reescritura Haiku del "por qué").
// Endurecido tras QA adversarial de Slowking (B1 bypass por eufemismo/conjugación, B2 fuga de cifra
// meta, I1 swap de unidad, I2 negación/timeframes, I3 mitos).
//
// DISTINTO de verificarNudgeIA: aquí el vocabulario educativo neutro está PERMITIDO (peso, bajar/subir
// de peso, grasa corporal, déficit, composición corporal, IMC, adelgazar, masa muscular, calorías).
// Se BLOQUEA solo TCA/peligro REAL. LECCIÓN: blocklist NUNCA es 100% → barrera PRIMARIA = prompt
// estricto; esto es BACKSTOP; fallback determinista SIEMPRE seguro. Ante duda, BLOQUEA.

export const LARGO_MAX_EDU = 600;

// Stems que SIEMPRE bloquean (prefijo-de-token → sin falsos positivos tipo 'recompensa'→'compens').
export const STEMS_TCA = [
  'purg', 'vomit', 'laxante', 'diuretic', 'starve',        // purga / inanición (en)
  'castig',                                                 // castigo
  'restrin', 'restric',                                     // restricción extrema (re-agregado, B1)
  'anorex', 'bulim', 'thinspo',                             // pro-ana
  'detox', 'depurativ',                                     // mitos detox (I3)
  'veneno', 'toxico', 'toxica',                             // demonización dura
];

// Términos NEGABLES: bloquean SOLO si NO están negados (marco "añadir, no restringir" — I2a).
// 'no es un alimento malo' / 'ningún alimento está prohibido' deben PASAR.
export const NEGABLES = ['prohib', 'pecad', 'alimento malo', 'alimentos malos', 'comida mala',
  'alimento prohibido', 'comida prohibida', 'alimentos prohibidos', 'demoniz'];

// Frases que SIEMPRE bloquean (substring sobre texto normalizado).
export const FRASES_TCA = [
  // dejar/no comer / saltarse (conjugaciones finitas; 'no es...' NO cae aquí)
  'deja de comer', 'dejar de comer', 'dejes de comer',
  'no comer', 'no comas', 'no coma', 'no cenar', 'no cenes', 'no cene', 'no desayunar', 'no desayunes',
  'no almorzar', 'no almuerces', 'no almuerce', 'no comer nada', 'skip meals', 'skip meal', 'skip breakfast', 'skip dinner',
  // pasar hambre / inanición
  'muerete de hambre', 'pasar hambre', 'aguanta el hambre', 'aguantate el hambre', 'aguantarte el hambre',
  'comer casi nada', 'come casi nada', 'comes casi nada', 'entre menos comas', 'entre menos comes',
  'lo menos que puedas comer', 'apenas comer', 'apenas comas',
  // ayuno PELIGROSO (NO 'ayuno intermitente')
  'ayuno prolongado', 'ayunar por dias', 'ayuno de dias', 'ayunar varios dias', 'dias sin comer', 'dejar de comer por dias',
  // culpa / compensación / castigo
  'te portaste mal', 'culpa por comer', 'verguenza por comer', 'te pasaste comiendo',
  'quema lo que comiste', 'suda lo que comiste', 'para compensar la comida', 'ejercicio compensatorio',
  'ejercicio de castigo', 'doble cardio', 'compensa lo que comiste', 'compensalo con ejercicio',
  // velocidad peligrosa (con cue de peso; los timeframes solos se manejan por co-ocurrencia, I2b)
  'baja de peso rapido', 'bajar de peso rapido', 'baja de peso rapidamente', 'adelgaza rapido',
  'adelgazar rapidamente', 'perdida rapida', 'pierde peso rapido', 'baja rapido de peso',
  // cero-macro absoluto COMO META
  'cero carbo', 'cero grasa', 'sin carbohidratos', 'nada de carbohidratos', 'elimina los carbohidratos',
  'nada de grasa', 'elimina las grasas', 'sin nada de grasa',
  // pro-ana (frases; 'huesos' a secas NO, es legítimo para calcio)
  'en los huesos', 'huesos se ven', 'huesos marcados', 'marquen los huesos', 'thigh gap',
  'entre mas flaca', 'lo mas flaca', 'entre mas flaco', 'lo mas flaco',
  // mitos / dietas peligrosas (I3). 'quemar grasa' a secas NO se bloquea (oxidación legítima).
  'jugo detox', 'dieta detox', 'te detox', 'limpieza depurativa', 'pastillas para adelgazar',
  'quemador de grasa', 'quemagrasa', 'alimentos que queman grasa', 'dieta de 500 calorias',
  'solo 500 calorias', 'dieta del agua', 'solo agua', 'solo liquidos',
  // restricción extrema con intensificador (además de los stems restrin/restric)
  'reduce al maximo', 'reducir al maximo', 'al maximo las calorias', 'recorta al maximo', 'severamente las calorias',
];

// Co-ocurrencia RAÍZ+OBJETO por ADYACENCIA (ventana de 3 tokens) → generaliza a conjugación/eufemismo
// sin los falsos positivos de "el cuerpo saca energía de la comida" (obj lejano). (B1)
const COOCURRENCIAS = [
  { verbs: ['regres', 'devuelv', 'devolv', 'saca', 'sacar', 'expuls', 'bota', 'botar'], objs: ['comida', 'comidas', 'comiste', 'comi', 'alimento', 'alimentos', 'bocado'], motivo: 'purga_euf' },
  { verbs: ['provoca', 'provocar', 'provocate', 'induc', 'inducir'], objs: ['nausea', 'nauseas', 'vomito', 'vomitar', 'arcada', 'arcadas'], motivo: 'purga_provoca' },
  { verbs: ['salta', 'saltar', 'saltate', 'saltarte', 'brinca', 'brincar', 'brincate', 'omit', 'omite', 'omitir', 'omitas'], objs: ['comida', 'comidas', 'cena', 'cenar', 'desayuno', 'almuerzo', 'comer'], motivo: 'saltarse' },
  { verbs: ['vaciar', 'vaciate', 'vaciarte', 'vacia'], objs: ['estomago', 'comida', 'comiste'], motivo: 'purga_vaciar' },
];

const CUE_NEGACION = /(^|[^a-z])(no|ni|ningun|ninguna|nada|sin|jamas|nunca)([^a-z]|$)/;

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}
function tokens(norm) {
  return norm.split(/[^a-z]+/).filter(Boolean);
}
export function extraerNumeros(s) {
  const m = String(s || '').match(/\d+/g);
  return (m || []).map((x) => x);
}

// ¿Hay una ocurrencia de `term` que NO esté negada? (para NEGABLES). true → bloquear.
function hayNoNegado(norm, term) {
  let i = norm.indexOf(term);
  while (i !== -1) {
    const win = norm.slice(Math.max(0, i - 30), i);
    if (!CUE_NEGACION.test(win)) return true;
    i = norm.indexOf(term, i + term.length);
  }
  return false;
}

// Co-ocurrencia verbo+objeto por adyacencia (prefijo-de-token, ventana). (B1)
function coocurre(toks) {
  for (const regla of COOCURRENCIAS) {
    for (let i = 0; i < toks.length; i += 1) {
      if (!regla.verbs.some((v) => toks[i].startsWith(v))) continue;
      for (let j = i + 1; j <= i + 3 && j < toks.length; j += 1) {
        if (regla.objs.some((o) => toks[j].startsWith(o))) return regla.motivo;
      }
    }
  }
  return null;
}

// Pérdida peligrosamente rápida: timeframe corto + (cue 'rapid' o magnitud >=2 kg). (I2b)
// Ritmo seguro (~0.5 kg/semana o 'por semana') sobrevive.
function perdidaRapida(norm) {
  // cue de velocidad + pérdida/peso → 'adelgazar rápido', 'baja de peso rápido' (sin timeframe).
  if (/rapid/.test(norm) && /(baja|bajar|pierde|perder|adelgaz|kg|kilos)/.test(norm)) return true;
  // timeframe corto + magnitud grande (>=2 kg). Ritmo seguro (~0.5 kg) sobrevive.
  const timeframe = /(en una semana|en unos dias|en pocos dias|en \d+ dias|en \d+ dia|en dias|esta semana|estos dias)/.test(norm);
  if (!timeframe) return false;
  const re = /(\d+(?:\.\d+)?)\s*(kg|kilos?|kilogramos?)/g;
  let m;
  while ((m = re.exec(norm))) { if (parseFloat(m[1]) >= 2) return true; }
  return false;
}

// ── Protección de cifras (B2 fuga de meta + I1 swap de unidad) ──
const UNIDAD_CANON = {
  kg: 'peso', kilo: 'peso', kilos: 'peso', kilogramo: 'peso', kilogramos: 'peso',
  g: 'g', gr: 'g', gramo: 'g', gramos: 'g',
  kcal: 'kcal', cal: 'kcal', caloria: 'kcal', calorias: 'kcal',
  libra: 'lb', libras: 'lb', lb: 'lb', lbs: 'lb',
  ml: 'ml', l: 'l', litro: 'l', litros: 'l',
  semana: 'semana', semanas: 'semana', dia: 'dia', dias: 'dia', mes: 'mes', meses: 'mes',
};
const UNIDADES_META = new Set(['peso', 'kcal', 'lb']); // metas calóricas / de peso

function paresNumUnidad(norm) {
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*([a-z%]+)?/g;
  let m;
  while ((m = re.exec(norm))) {
    const rawU = m[2] || null;
    out.push({ num: m[1], unidad: rawU ? (UNIDAD_CANON[rawU] || null) : null });
  }
  return out;
}

function cifrasSeguras(normIA, base) {
  const numsBase = extraerNumeros(base);
  const setBase = new Set(numsBase);
  const numsIA = new Set(extraerNumeros(normIA));
  // 1) base ⊆ IA: toda cifra REAL del motor debe seguir presente.
  for (const n of numsBase) if (!numsIA.has(n)) return { ok: false, motivo: `cifra_alterada:${n}` };
  const paresBase = paresNumUnidad(normalizar(base));
  const paresIA = paresNumUnidad(normIA);
  // 2) I1: cada cifra-META real de la base (kcal/kg/lb) debe reaparecer con su MISMA unidad — atrapa el
  //    swap de unidad con mismo dígito (2 kg → 2 libras). Solo META: los gramos de proteína no aplican
  //    (evita falso positivo con la base de datos reales del motor).
  for (const p of paresBase) {
    if (!p.unidad || !UNIDADES_META.has(p.unidad)) continue;
    if (!paresIA.some((q) => q.num === p.num && q.unidad === p.unidad)) return { ok: false, motivo: `unidad_alterada:${p.num}` };
  }
  // 3) B2: la IA NO puede PRESCRIBIR una cifra nueva que no esté en la base. Una CALORÍA nueva
  //    (cualquier valor) es prescripción → bloquea. Un PESO nuevo grande (>=2 kg/lb) es meta/ritmo
  //    peligroso → bloquea; un peso pequeño (~0.5 kg, ritmo seguro educativo) SÍ pasa.
  for (const q of paresIA) {
    if (!q.unidad || setBase.has(q.num)) continue;
    if (q.unidad === 'kcal') return { ok: false, motivo: `meta_nueva:${q.num}` };
    if ((q.unidad === 'peso' || q.unidad === 'lb') && parseFloat(q.num) >= 2) return { ok: false, motivo: `meta_nueva:${q.num}` };
  }
  return { ok: true };
}

// POST-CHECK: ¿la reescritura educativa es publicable? Compara contra la base determinista (verdad).
export function verificarEducacionIA(textoIA, base) {
  const t = String(textoIA || '').trim();
  if (!t) return { ok: false, motivo: 'vacio' };
  if (t.length > LARGO_MAX_EDU) return { ok: false, motivo: 'largo' };

  const norm = normalizar(t);
  const toks = tokens(norm);

  for (const f of FRASES_TCA) if (norm.includes(f)) return { ok: false, motivo: `tca:${f}` };
  for (const tok of toks) for (const st of STEMS_TCA) if (tok.startsWith(st)) return { ok: false, motivo: `tca:${st}` };
  for (const term of NEGABLES) if (norm.includes(term) && hayNoNegado(norm, term)) return { ok: false, motivo: `demoniz:${term}` };
  const coo = coocurre(toks);
  if (coo) return { ok: false, motivo: `tca:${coo}` };
  if (perdidaRapida(norm)) return { ok: false, motivo: 'perdida_rapida' };

  return cifrasSeguras(norm, base);
}
