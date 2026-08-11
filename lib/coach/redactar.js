// Coach · Proactividad Fase 1.5 — REDACCIÓN de tono con IA (Haiku) + POST-CHECK determinista.
//
// Regla de oro: la IA SOLO reescribe el TONO. Las CIFRAS son verdad del motor (el cuerpo
// determinista de F1) y NO se pueden cambiar ni inventar. Si la IA se sale del carril (menciona
// peso/báscula, culpa, cambia o inventa cifras, o alarga de más) → DESCARTAMOS y usamos el texto
// determinista (fallback con gracia). Free nunca llega aquí (Pro-only, gating en el cron).

// Léxico PROHIBIDO (guardrails validados: cero peso/báscula, cero culpa/restricción, cero TCA).
//
// LECCIÓN DEL PROYECTO (igual que el guard de salud): un blocklist de substrings NUNCA es 100%
// hermético. La barrera PRIMARIA es el PROMPT ESTRICTO (Haiku obedece reglas absolutas); este
// post-check es el BACKSTOP; y el FALLBACK determinista siempre es seguro. Si se observa drift en
// producción, el siguiente paso es una 2ª pasada clasificadora (feature futura).
//
// Para ser morfológicamente robusto SIN sobre-filtrar, los STEMS se comparan por PREFIJO-DE-TOKEN
// (no substring): 'atracon/atracones' caen con 'atrac', pero 'resaltar'/'recompensa'/'registra'/
// 'detalle' NO se bloquean (no empiezan con el stem). Las variantes multi-palabra van como FRASES
// (substring sobre texto normalizado). Los cuerpos deterministas de F1 no contienen nada de esto →
// el fallback siempre pasa el post-check por construcción.
export const STEMS_PROHIBIDOS = [
  // TCA / restricción / purga / castigo
  //  · 'atracon' (no 'atrac') → atrapa atracon/atracones sin romper 'atractiva/atracción'.
  'atracon', 'ayun', 'compens', 'purg', 'vomit', 'castig', 'penitencia', 'detox', 'restrin', 'restric',
  // peso / cuerpo / imagen corporal
  //  · SIN 'pesar' (rompía 'a pesar de') y SIN 'medid' (rompía 'en buena medida'); lo dañino ya lo
  //    cubren 'peso'/'pesas'/'pesart'/'bascula' + frases. 'peso' como prefijo-token NO rompe
  //    'pesado'/'reposo' (no empiezan con 'peso').
  'adelgaz', 'engord', 'obes', 'imc', 'peso', 'pesas', 'pesart', 'bascula',
  'kilo', 'gord', 'flac', 'cintura', 'talla', 'figura', 'panza', 'abdomen', 'barrig', 'lonja', 'rollito', 'inflad',
  // "quemar" grasa/calorías + saltarse-comida reflexivo (prefijo-token evita 'resaltar')
  'quema', 'quemar', 'saltart', 'saltat', 'saltars', 'saltand',
];
export const FRASES_PROHIBIDAS = [
  // grasa: bloqueamos solo frases de REDUCCIÓN; 'grasa saludable' sola es válida (marco "añadir").
  'grasa corporal', 'reduce grasa', 'reduce la grasa', 'reducir grasa', 'reducir la grasa',
  'quema grasa', 'quemar grasa', 'pierde grasa', 'perder grasa', 'baja grasa', 'baja la grasa',
  'bajar grasa', 'menos grasa', 'grasa abdominal', 'grasa de mas', 'bajar barriga',
  // saltarse / no comer
  'salta la cena', 'salta el desayuno', 'salta la comida', 'salta comida', 'salta el almuerzo',
  'saltar la cena', 'saltar el desayuno', 'saltar la comida', 'saltar comida',
  'no comas', 'no cenes', 'no desayunes', 'no comer', 'deja de comer', 'sin comer', 'dejar de comer',
  // dieta restrictiva
  'dieta severa', 'dieta dura', 'dieta estricta', 'dieta extrema', 'dieta restrictiva',
  // peso / medidas corporales (frase, no stem 'medid' → no rompe 'en buena medida')
  'baja de peso', 'subir de peso', 'bajar de peso', 'medidas corporales', 'baja medidas',
  // ejercicio-castigo / purga
  'doble cardio', 'suda lo que', 'quemalo con ejercicio',
  // hambre: SOLO frases (nunca 'hambre' a secas → 'una cena quita el hambre' es válido)
  'aguantate el hambre', 'aguanta el hambre', 'muerete de hambre', 'pasar hambre',
  // restricción extrema
  'cero carbo', 'ni un gramo',
  // culpa / reproche
  'te pasaste', 'comiste de mas', 'de mas hoy', 'vas mal', 'mal dia', 'deberias haber', 'no debiste',
];

export const LARGO_MAX = 300; // un nudge es 1-2 frases; más = se salió del formato

// minúsculas + sin acentos (á->a, N->n) + espacios colapsados -> 'AYUNA  hoy' equivale a 'ayuna hoy'.
function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

// tokens alfabeticos del texto normalizado (para el match por PREFIJO-DE-TOKEN).
function tokens(norm) {
  return norm.split(/[^a-z]+/).filter(Boolean);
}

// Extrae los números (enteros) de un texto → para comparar cifras determinista vs IA.
export function extraerNumeros(s) {
  const m = String(s || '').match(/\d+/g);
  return (m || []).map((x) => x);
}

// POST-CHECK: ¿el texto de la IA es publicable? Compara contra el cuerpo determinista (verdad).
// Devuelve { ok:boolean, motivo?:string }.
export function verificarNudgeIA(textoIA, cuerpoDeterminista) {
  const t = String(textoIA || '').trim();
  if (!t) return { ok: false, motivo: 'vacio' };
  if (t.length > LARGO_MAX) return { ok: false, motivo: 'largo' };

  const norm = normalizar(t);
  // Frases multi-palabra → substring sobre el texto normalizado.
  for (const frase of FRASES_PROHIBIDAS) {
    if (norm.includes(frase)) return { ok: false, motivo: `prohibido:${frase}` };
  }
  // Stems → prefijo-de-token (no substring): 'atracones' cae; 'resaltar'/'registra'/'detalle' NO.
  for (const tok of tokens(norm)) {
    for (const st of STEMS_PROHIBIDOS) {
      if (tok.startsWith(st)) return { ok: false, motivo: `prohibido:${st}` };
    }
  }

  // Cifras INTACTAS: el conjunto de números debe ser EXACTAMENTE el del cuerpo determinista.
  // (⊆ evita que se pierdan; ⊇ evita cifras inventadas.)
  const numsDet = new Set(extraerNumeros(cuerpoDeterminista));
  const numsIA = new Set(extraerNumeros(t));
  for (const n of numsDet) if (!numsIA.has(n)) return { ok: false, motivo: `cifra_perdida:${n}` };
  for (const n of numsIA) if (!numsDet.has(n)) return { ok: false, motivo: `cifra_inventada:${n}` };

  return { ok: true };
}

// Descripción del tono para el prompt, según el modo del usuario (coach_notification_prefs.modo).
const TONO_DESC = {
  tranquilo: 'sereno y breve, sin presión; una invitación calmada',
  normal: 'cercano y motivador, cálido pero directo',
  entrenador: 'enérgico y motivador, como un entrenador que te echa porras (sin gritar)',
};

// Llama a Haiku para reescribir SOLO el tono. Devuelve el texto (string) o lanza si la API falla.
// El caller (cron) hace reserva-antes-de-llamar + reembolso/fallback. Números como ground-truth.
export async function redactarConIA({ anthropic, model, cuerpo, titulo, modo }) {
  const tono = TONO_DESC[modo] || TONO_DESC.normal;
  const system =
    'Eres el coach nutricional de una app. Reescribe el MENSAJE del usuario cambiando SOLO el TONO. ' +
    'REGLAS ABSOLUTAS (si rompes una, fallaste):\n' +
    '1) NO cambies ningún número: las cifras son verdad del sistema, cópialas idénticas.\n' +
    '2) NO inventes cifras nuevas ni agregues datos.\n' +
    '3) PROHIBIDO mencionar peso, báscula, kilos, adelgazar/engordar, IMC o dietas restrictivas.\n' +
    '4) PROHIBIDO culpar o decir "te pasaste"/"comiste de más"/"vas mal". Marco de AÑADIR, no restringir.\n' +
    '5) CERO consejo médico. La racha es de hábito de registro, nunca de dieta.\n' +
    '6) Máximo 2 frases. Sin emojis, sin markdown, sin comillas.\n' +
    `Tono objetivo: ${tono}.\n` +
    'Devuelve SOLO el texto reescrito, nada más.';
  const r = await anthropic.messages.create({
    model,
    max_tokens: 160,
    system,
    messages: [{ role: 'user', content: `Título: ${titulo}\nMensaje: ${cuerpo}` }],
  });
  const parts = Array.isArray(r?.content) ? r.content : [];
  const txt = parts.map((p) => (p?.type === 'text' ? p.text : '')).join('').trim();
  return txt;
}

// ORQUESTA la redacción de UN nudge con dependencias INYECTADAS (testeable sin red/DB):
//   - reservar():  llama al metering server-only → { allowed, reason }.
//   - reembolsar(): revierte la reserva (IA falló / post-check descartó).
// Devuelve { cuerpo, via:'ia'|'determinista', motivo? }. NUNCA lanza: siempre degrada al
// determinista (verdad del motor). Free / IA apagada / cap / kill-switch → determinista SIN llamar
// al modelo (garantiza 0 gasto cuando no corresponde). Si la IA se sale del carril → reembolsa.
export async function puliArNudge({ anthropic, isPro, model, nudge, modo, reservar, reembolsar }) {
  const determinista = (motivo) => ({ cuerpo: nudge.cuerpo, via: 'determinista', motivo });
  if (!anthropic || !isPro) return determinista('no_elegible'); // Free / IA apagada → 0 IA
  const gate = await reservar();
  if (!gate?.allowed) return determinista(gate?.reason || 'no_reserva'); // kill/cap/airbag → 0 llamada al modelo
  try {
    const texto = await redactarConIA({ anthropic, model, cuerpo: nudge.cuerpo, titulo: nudge.titulo, modo });
    const chk = verificarNudgeIA(texto, nudge.cuerpo);
    if (chk.ok) return { cuerpo: texto, via: 'ia' };
    await reembolsar();
    return determinista(chk.motivo);
  } catch {
    await reembolsar();
    return determinista('ia_error');
  }
}
