// Coach · Educación Fase B.5 — POST-CHECK EDUCATIVO (backstop de la reescritura Haiku del "por qué").
//
// DISTINTO de verificarNudgeIA (afinado para nudges) que sobre-filtra la educación: aquí el
// vocabulario educativo legítimo en marco NEUTRO-SALUDABLE está PERMITIDO (peso, bajar/subir de peso,
// grasa corporal, déficit/superávit, composición corporal, IMC, adelgazar, masa muscular, calorías,
// macros). Solo se BLOQUEA TCA REAL (restricción extrema, purga, ayuno peligroso, culpa/castigo,
// pérdida peligrosamente rápida, cero-macro como meta, ejercicio compensatorio, demonización).
//
// LECCIÓN del proyecto: un blocklist NUNCA es 100% hermético → la barrera PRIMARIA es el PROMPT
// ESTRICTO; este post-check es el BACKSTOP; y el FALLBACK determinista es SIEMPRE seguro. Mismo
// enfoque morfológico que ya funcionó: STEMS por PREFIJO-DE-TOKEN (no substring) + FRASES
// multi-palabra + normalización sin acentos/mayúsculas. Sobre-bloquear solo cuesta un fallback a la
// base (seguro); dejar pasar TCA es lo grave → ante duda, bloquear.

export const LARGO_MAX_EDU = 600; // una explicación educativa puede ser algo más larga que un nudge

// BLOQUEAR TCA REAL. Stems por PREFIJO-DE-TOKEN (evita falsos positivos tipo 'recompensa'→'compens').
export const STEMS_TCA = [
  'purg', 'vomit', 'laxante', 'diuretic',     // purga
  'castig',                                    // castigo/castigar/castigate
  'prohib', 'pecad', 'veneno', 'toxico', 'toxica', // demonización de alimentos
];

// FRASES multi-palabra (substring sobre texto normalizado). NO incluir vocabulario educativo neutro.
export const FRASES_TCA = [
  // dejar/saltarse de comer o pasar hambre como estrategia
  'deja de comer', 'dejar de comer', 'no comas', 'no cenes', 'no desayunes', 'no comer nada',
  'salta la cena', 'salta el desayuno', 'salta la comida', 'saltate la comida', 'saltarte las comidas',
  'muerete de hambre', 'pasar hambre', 'aguanta el hambre', 'aguantate el hambre', 'aguantarte el hambre',
  // ayuno PELIGROSO (NO 'ayuno intermitente', que es legítimo y no se lista aquí)
  'ayuno prolongado', 'ayunar por dias', 'ayuno de dias', 'ayunar varios dias', 'dias sin comer', 'dejar de comer por dias',
  // culpa / vergüenza / compensación
  'te portaste mal', 'culpa por comer', 'verguenza por comer', 'te pasaste comiendo',
  'quema lo que comiste', 'suda lo que comiste', 'para compensar la comida', 'ejercicio compensatorio',
  'ejercicio de castigo', 'doble cardio', 'compensa lo que comiste', 'compensalo con ejercicio',
  // pérdida PELIGROSAMENTE rápida (backstop; el prompt evita generar rates extremos)
  'en una semana', 'en unos dias', 'en 3 dias', 'en tres dias', 'kilos en dias', 'kg en dias',
  'bajar rapido', 'baja rapido', 'perder rapido', 'pierde rapido', 'adelgaza rapido', 'perdida rapida',
  'lo mas rapido posible', 'baja de peso rapido', 'bajar de peso rapido', 'baja de peso rapidamente',
  // cero-macro absoluto COMO META
  'cero carbo', 'cero grasa', 'sin carbohidratos', 'nada de carbohidratos', 'elimina los carbohidratos',
  'nada de grasa', 'elimina las grasas', 'sin nada de grasa',
  // demonización multi-palabra
  'alimento malo', 'alimentos malos', 'comida mala', 'esta prohibido', 'alimentos prohibidos', 'comida prohibida',
];

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

// POST-CHECK: ¿la reescritura educativa es publicable? Compara contra la base determinista (verdad).
// Devuelve { ok, motivo? }.
//  1) vacío / demasiado largo → bloquea.
//  2) TCA real (frases + stems) → bloquea.
//  3) PROTECCIÓN DE CIFRAS: cada número de la base debe aparecer en la reescritura (base ⊆ IA) →
//     preserva las cifras REALES del usuario. Se PERMITEN números extra (ilustrativos genéricos).
export function verificarEducacionIA(textoIA, base) {
  const t = String(textoIA || '').trim();
  if (!t) return { ok: false, motivo: 'vacio' };
  if (t.length > LARGO_MAX_EDU) return { ok: false, motivo: 'largo' };

  const norm = normalizar(t);
  for (const f of FRASES_TCA) if (norm.includes(f)) return { ok: false, motivo: `tca:${f}` };
  for (const tok of tokens(norm)) {
    for (const st of STEMS_TCA) if (tok.startsWith(st)) return { ok: false, motivo: `tca:${st}` };
  }

  // Cifras reales de la base preservadas (base ⊆ IA). Extra ilustrativas permitidas.
  const numsIA = new Set(extraerNumeros(t));
  for (const n of extraerNumeros(base)) {
    if (!numsIA.has(n)) return { ok: false, motivo: `cifra_alterada:${n}` };
  }
  return { ok: true };
}
