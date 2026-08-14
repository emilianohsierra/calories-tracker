// Coach · Educación — REPASO ESPACIADO (SM-2 adaptado) + DOMINIO por-tema. Núcleo 100% DETERMINISTA
// (0 IA, $0): programarRepaso (aritmética SM-2 de Karpathy), dominioDe (umbral conservador), y el
// CATÁLOGO de ItemRepaso. Todo tuneable por PR (constantes recalibrables sin redeploy). El contenido de
// los ítems se REUSA del curriculum/cerebro de Karpathy (plan/educacion-repaso-cerebro.md §4 + LECCIONES),
// NO se inventa. Cifras SOLO del motor (slots); si falta el dato, se omite el contexto.
//
// Invariantes (Drucker/Karpathy): el repaso JAMÁS evalúa/sugiere restricción o peso; distractores = mitos
// (responder los RECHAZA); marco añadir-no-restringir, contexto México; condiciones → derivar (gate
// esDatoDeSalud vivo, aplicado en la ruta). Free = ilimitado determinista.

// ── Config SM-2 (Karpathy §1-2). Recalibrable sin migración. ──────────────────────────────────
export const SRS = {
  LADDER: [1, 3, 7, 14, 30], // intervalos base en días por rung 0..4
  TOPE_DIAS: 60, // más allá de rung 4: intervalo = round(intervalo × ease), tope 60
  EASE_DEFAULT: 2.3,
  EASE_MIN: 1.6,
  EASE_MAX: 2.8,
  EASE_UP: 0.1, // acierto (día distinto) sube ease
  EASE_DOWN: 0.2, // fallo baja ease
  DOMINADO_ACIERTOS: 3, // ≥3 aciertos en días SEPARADOS
  DOMINADO_RUNG: 3, // Y rung ≥ 3 (intervalo ≥ 14 d)
};

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const int = (v, d) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const round2 = (x) => Math.round(x * 100) / 100;
const clampEase = (e) => Math.min(SRS.EASE_MAX, Math.max(SRS.EASE_MIN, e));

// Suma días a una fecha 'YYYY-MM-DD' (UTC puro, sin Date.now).
export function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Días transcurridos entre dos fechas 'YYYY-MM-DD' (a - b), ≥ 0 truncado a 0.
export function diasEntre(a, b) {
  if (!a || !b) return 0;
  const da = new Date(`${a}T00:00:00Z`); const db = new Date(`${b}T00:00:00Z`);
  return Math.max(0, Math.round((da - db) / 86400000));
}

// Intervalo en días para un rung dado (escalera hasta 4; luego ×ease con tope).
function intervaloDeRung(rung, intervaloPrev, ease) {
  if (rung < SRS.LADDER.length) return SRS.LADDER[rung];
  const base = intervaloPrev > 0 ? intervaloPrev : SRS.LADDER[SRS.LADDER.length - 1];
  return Math.min(SRS.TOPE_DIAS, Math.round(base * ease));
}

// ¿Dominado? Conservador: ≥3 aciertos en días separados Y rung ≥3. Params recalibrables (SRS.*).
export function dominioDe(rung, aciertosConsecutivos) {
  return (int(aciertosConsecutivos, 0) >= SRS.DOMINADO_ACIERTOS && int(rung, 0) >= SRS.DOMINADO_RUNG)
    ? 'dominado' : 'aprendiendo';
}

// SM-2 PURO. prev = fila education_progress (rung/ease_factor/intervalo/aciertos_consecutivos/ultimo_visto).
// resultado = { correcto:bool, conPista?:bool }. hoy = 'YYYY-MM-DD'.
// Devuelve el patch determinista: { ease_factor, rung, intervalo, aciertos_consecutivos, next_review, estado, reensena }.
// Guard anti-spam: un acierto solo AVANZA si es en día DISTINTO al último review (varios quizzes el mismo
// día = consolidan, no premian). Acierto-con-pista mantiene el rung (consolida sin premiar de más).
export function programarRepaso(prev = {}, resultado = {}, hoy) {
  const easePrev = clampEase(num(prev.ease_factor, SRS.EASE_DEFAULT));
  const rungPrev = Math.max(0, int(prev.rung, 0));
  const intervaloPrev = int(prev.intervalo, 0);
  const acPrev = Math.max(0, int(prev.aciertos_consecutivos, 0));
  const mismoDia = !!(prev.ultimo_visto && prev.ultimo_visto === hoy);
  const correcto = !!resultado.correcto;
  const conPista = !!resultado.conPista;

  let ease = easePrev; let rung = rungPrev; let intervalo = intervaloPrev; let ac = acPrev; let reensena = false;

  if (!correcto) {
    // FALLO → reinicia a rung 0 (1 día), baja ease, resetea la racha, re-enseña con OTRA forma.
    rung = 0; intervalo = SRS.LADDER[0]; ac = 0; ease = clampEase(easePrev - SRS.EASE_DOWN); reensena = true;
  } else if (conPista || mismoDia) {
    // Acierto con pista/duda o mismo día → consolida: mantiene rung/ease/racha; reprograma al intervalo actual.
    intervalo = intervaloPrev > 0 ? intervaloPrev : SRS.LADDER[Math.min(rungPrev, SRS.LADDER.length - 1)];
  } else {
    // ACIERTO en día distinto → avanza rung, sube ease, cuenta para dominio.
    rung = rungPrev + 1;
    ease = clampEase(easePrev + SRS.EASE_UP);
    intervalo = intervaloDeRung(rung, intervaloPrev || SRS.LADDER[Math.min(rungPrev, SRS.LADDER.length - 1)], ease);
    ac = acPrev + 1;
  }

  return {
    ease_factor: round2(ease),
    rung,
    intervalo,
    aciertos_consecutivos: ac,
    next_review: sumarDias(hoy, intervalo),
    estado: dominioDe(rung, ac),
    reensena,
  };
}

// ── CATÁLOGO de ItemRepaso (Karpathy §4 + LECCIONES vivas; contenido REUSADO, revisado como el curriculum).
//    Cada tema tiene ≥2 `formas` para variar la re-enseñanza. `contexto` usa SLOTS del MOTOR (se omite si
//    falta el dato). Distractores = mitos (energía-rápida / no-comer-solo-ensaladas / evitar-alimento-solo-natural):
//    la respuesta correcta RECHAZA el mito. Ningún ítem afirma un mito ni demoniza un alimento. ──
export const CATALOGO = {
  proteina: {
    titulo: 'Proteína',
    formas: [
      {
        id: 'v1',
        contexto: 'Hoy llevas {{prot_consumida}} de {{prot_meta}} g de proteína.',
        pregunta: '¿Por qué te conviene priorizar la proteína cuando bajas grasa?',
        opciones: ['Te da energía rápida', 'Preserva tu músculo y te sacia', 'Te hidrata'],
        correcta: 1,
        feedback_ok: 'Exacto: preserva músculo y sacia — por eso la priorizamos.',
        feedback_no: 'Sobre todo preserva músculo y sacia; la energía rápida viene de los carbohidratos.',
      },
      {
        id: 'v2',
        contexto: 'Hoy llevas {{prot_consumida}} de {{prot_meta}} g.',
        pregunta: '¿Para qué sirve sobre todo la proteína cuando bajas grasa?',
        opciones: ['Darte energía rápida', 'Preservar músculo y saciar', 'Hidratarte'],
        correcta: 1,
        feedback_ok: 'Preservar músculo y saciar: por eso la priorizamos en déficit.',
        feedback_no: 'Lo clave es preservar músculo y saciar; la energía rápida viene de los carbohidratos.',
      },
    ],
  },
  deficit: {
    titulo: 'Déficit',
    formas: [
      {
        id: 'v1',
        contexto: 'Tu meta de hoy son {{kcal_meta}} kcal, calculada sin extremos.',
        pregunta: '¿Qué describe mejor un déficit sano?',
        opciones: ['No comer', 'Comer un poco menos de lo que gastas, sostenible', 'Solo ensaladas'],
        correcta: 1,
        feedback_ok: 'Un poco menos de lo que gastas, sostenible — no privarte.',
        feedback_no: 'Es comer un poco menos de lo que gastas, sostenible — no dejar de comer.',
      },
      {
        id: 'v2',
        pregunta: 'Un déficit sano es…',
        opciones: ['No comer', 'Comer un poco menos de lo que gastas', 'Solo ensaladas'],
        correcta: 1,
        feedback_ok: 'Comer un poco menos de lo que gastas, sostenible — no privarte.',
        feedback_no: 'Comer un poco menos de lo que gastas — no privarte ni saltarte comidas.',
      },
    ],
  },
  calidad_sin_culpa: {
    titulo: 'Calidad sin culpa',
    formas: [
      {
        id: 'v1',
        pregunta: '¿Qué importa más para tu salud?',
        opciones: ['Evitar por completo un alimento', 'Tu patrón general y el contexto', 'Comer solo "natural"'],
        correcta: 1,
        feedback_ok: 'Tu patrón general y el contexto — no un alimento aislado.',
        feedback_no: 'Lo que importa es tu patrón general y el contexto, no un alimento aislado.',
      },
      {
        id: 'v2',
        pregunta: '¿Qué pesa más para tu salud a largo plazo?',
        opciones: ['Evitar por completo un alimento', 'Tu patrón general y el contexto', 'Comer solo "natural"'],
        correcta: 1,
        feedback_ok: 'Tu patrón general y el contexto mandan, no un alimento aislado.',
        feedback_no: 'Tu patrón general y el contexto mandan — no un alimento aislado.',
      },
    ],
  },
};

// Temas del repaso presentes en el catálogo. La ruta los intersecta con el curriculum VIVO (CONCEPTOS_MVP):
// un concepto que ya no exista en el curriculum queda como fila huérfana → IGNORADA (deploy-safe).
export const TEMAS_REPASO = Object.keys(CATALOGO);

// Rellena slots {{x}} del contexto; deja el slot si falta el dato (para detectarlo y omitir el contexto).
function rellenar(str, slots) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (m, k) => {
    const v = slots?.[k];
    return (v === null || v === undefined || v === '') ? m : String(v);
  });
}
const completo = (str) => !/\{\{\w+\}\}/.test(str);

// Elige la variante (forma) del día evitando la última mostrada (para variar la re-enseñanza).
export function elegirForma(tema, diaIdx = 0, ultimaForma = null) {
  const t = CATALOGO[tema];
  if (!t || !t.formas?.length) return null;
  const disp = (t.formas.length > 1 && ultimaForma) ? t.formas.filter((f) => f.id !== ultimaForma) : t.formas;
  const pool = disp.length ? disp : t.formas;
  return pool[Math.abs(Number(diaIdx) || 0) % pool.length];
}

// Construye el ItemRepaso final: pregunta/opciones fijas + contexto con cifras del MOTOR (omitido si falta slot).
export function construirItemRepaso(tema, forma, slots = {}) {
  if (!forma) return null;
  let contexto = null;
  if (forma.contexto) {
    const c = rellenar(forma.contexto, slots);
    if (completo(c)) contexto = c; // si falta un slot del motor → sin contexto, queda la pregunta conceptual
  }
  return {
    tema,
    forma: forma.id,
    titulo: CATALOGO[tema]?.titulo || tema,
    contexto,
    pregunta: forma.pregunta,
    opciones: forma.opciones,
    correcta: forma.correcta,
    feedback_ok: forma.feedback_ok,
    feedback_no: forma.feedback_no,
  };
}

// Selector DETERMINISTA de "qué repasar hoy" (0 IA). rows = filas education_progress con SRS. Prioridad:
// due (next_review ≤ hoy) → más vencido → más débil (más errores, ease más bajo). Solo temas VÁLIDOS
// (en el catálogo y en el curriculum vivo). Devuelve { concepto, atrasado_dias, pendientes } o null.
export function seleccionarDue(rows = [], hoy, temasValidos = TEMAS_REPASO) {
  const valid = new Set(temasValidos);
  const due = (rows || [])
    .filter((r) => r && valid.has(r.concepto) && r.next_review && r.next_review <= hoy)
    .map((r) => ({
      concepto: r.concepto,
      atrasado_dias: diasEntre(hoy, r.next_review),
      errores: int(r.errores, 0),
      ease: num(r.ease_factor, SRS.EASE_DEFAULT),
    }));
  if (!due.length) return null;
  due.sort((a, b) => (b.atrasado_dias - a.atrasado_dias) || (b.errores - a.errores) || (a.ease - b.ease));
  const top = due[0];
  return { concepto: top.concepto, atrasado_dias: top.atrasado_dias, pendientes: due.length };
}
