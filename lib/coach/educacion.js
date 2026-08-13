// Coach · Educación — gate de anti-saturación (intención), back-off de ofertas, y el builder del
// "por qué" adaptativo. La BASE de cada explicación es DETERMINISTA (curriculum, correcta y TCA-safe);
// Haiku SOLO la personaliza con los números reales del usuario y pasa por el MISMO post-check
// anti-TCA/peso que redactar.js (reuso, no duplico); si deriva → cae a la base determinista.
import { explicacionDe, leccionDe, conceptoDeTexto, CONCEPTOS_EXPLICABLES } from './curriculum';
import { verificarEducacionIA } from './verificarEducacionIA';

const SET_EXPLICABLES = new Set(CONCEPTOS_EXPLICABLES);

// Decide la ruta de /explicar. CLAVE del fix del bug del '¿Por qué?': un CONCEPTO whitelisteado
// (afordance del chip) SIEMPRE explica, SIN correr el guard de salud sobre el texto general. El guard
// esDatoDeSalud solo aplica a una PREGUNTA LIBRE del usuario (condiciones/síntomas/alergias → derivar).
// deps.esSalud = esDatoDeSalud (inyectado para testear). Devuelve { accion:'explicar'|'derivar'|'nada', concepto? }.
export function decidirExplicacion(body = {}, { esSalud } = {}) {
  if (typeof body.concepto === 'string' && SET_EXPLICABLES.has(body.concepto)) {
    return { accion: 'explicar', concepto: body.concepto }; // chip: concepto fijo y seguro → NO guard
  }
  const pregunta = typeof body.pregunta === 'string' ? body.pregunta : '';
  if (!pregunta.trim()) return { accion: 'nada' };
  if (esSalud && esSalud(pregunta)) return { accion: 'derivar' }; // pregunta libre de salud → derivar
  const c = conceptoDeTexto(pregunta);
  return c ? { accion: 'explicar', concepto: c } : { accion: 'nada' };
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// ── Gate de intención (Drucker §3): determinista-primero. ──────────────────────
//   'factual'  → pregunta rápida ("¿cuántas kcal tiene esto?") → responder directo, sin lección.
//   'porque'   → pregunta de por-qué/cómo ("¿por qué necesito déficit?") → educar al nivel.
//   'normal'   → ni una ni otra → flujo normal del coach.
const RE_FACTUAL = /\b(cuant[oa]s?|cual(es)?|que tanto)\b/;
const RE_PORQUE = /(por que|porque|para que|como funciona|que significa|que es un|que es el|por qu)/;
export function intentEducativo(mensaje) {
  const t = norm(mensaje);
  if (!t) return 'normal';
  if (RE_PORQUE.test(t)) return 'porque'; // el "por qué" gana al factual ("por qué son tantas kcal")
  if (RE_FACTUAL.test(t)) return 'factual';
  return 'normal';
}

// ── Back-off de ofertas de lección (Drucker §3): si ignora 2 seguidas, dejar de ofrecer. ──
export const MAX_OFERTAS_IGNORADAS = 2;
export function debeOfrecerLeccion(ofertasIgnoradas = 0) {
  return Number(ofertasIgnoradas) < MAX_OFERTAS_IGNORADAS;
}
// Actualiza el contador según la reacción: aceptó → reset; ignoró → +1.
export function trasOferta(ofertasIgnoradas = 0, acepto) {
  return acepto ? 0 : Number(ofertasIgnoradas) + 1;
}

// Línea de datos REALES por concepto (del motor; nunca inventa). Devuelve '' si no hay dato.
export function datosDe(concepto, ctx = {}) {
  const t = ctx.today || {};
  if (concepto === 'proteina') {
    const obj = t.pendientes && ctx.targets ? ctx.targets.protein_g : null;
    const cons = t.prot;
    if (obj > 0 && cons != null) {
      const falta = Math.max(0, Math.round(obj - cons));
      if (falta > 0) return `Hoy llevas ${Math.round(cons)} de ${Math.round(obj)} g; te faltan ${falta} g.`;
    }
    return '';
  }
  if (concepto === 'deficit') {
    const kcal = ctx.targets?.kcal_target;
    return kcal > 0 ? `Tu meta de hoy son ${Math.round(kcal)} kcal, calculada sin extremos.` : '';
  }
  return '';
}

// Texto DETERMINISTA de la explicación (base): variante por nivel + línea de datos reales.
export function explicacionBase(concepto, nivel, ctx) {
  const e = explicacionDe(concepto, nivel);
  if (!e) return null;
  const datos = datosDe(concepto, ctx);
  return { concepto, titulo: e.titulo, nivel: e.nivel, texto: datos ? `${e.texto} ${datos}` : e.texto };
}

// ORQUESTA el "por qué" con dependencias INYECTADAS (testeable). Base determinista SIEMPRE segura.
// Backstop en DOS etapas sobre la reescritura de Haiku:
//   (a) PRE-FILTRO barato = verificarEducacionIA (morfológico + protección de cifras). Caza → BLOQUEA gratis.
//   (b) Si pasa → JUEZ LLM (deps.juez, opcional): clasificador anti-TCA. FAIL-CLOSED (si lanza/timeout/
//       parse → se trata como PELIGROSO). Solo publica si el juez dice peligroso===false explícito.
// FALLBACK a la base + reembolso en CUALQUIER rama de bloqueo. Devuelve { ..., via:'ia'|'determinista' }.
export async function explicarConcepto(deps, { concepto, nivel, ctx } = {}) {
  const base = explicacionBase(concepto, nivel, ctx);
  if (!base) return null;
  const { anthropic, reservar, reembolsar, redactar, juez } = deps || {};
  // `motivo` = categoría diagnóstica NO-sensible (no expone prompt ni el término bloqueado).
  if (!anthropic || !reservar || !redactar) return { ...base, via: 'determinista', motivo: 'sin_ia' };
  const gate = await reservar();
  if (!gate?.allowed) {
    const r = gate?.reason || 'no_reserva';
    const motivo = r === 'kill_switch' ? 'kill' : (r === 'free_limit' || r === 'global_cap' || r === 'user_cap') ? 'cap' : r;
    return { ...base, via: 'determinista', motivo }; // 0 llamada al modelo
  }
  const caer = async (motivo) => { await reembolsar(); return { ...base, via: 'determinista', motivo }; };
  try {
    const texto = await redactar(base);
    // (a) Pre-filtro morfológico + protección de cifras.
    const chk = verificarEducacionIA(texto, base.texto);
    if (!chk.ok) return caer(/^(cifra|unidad|meta)/.test(chk.motivo || '') ? 'cifras_alteradas' : 'prefiltro_bloqueo');
    // (b) Juez LLM (si está cableado). FAIL-CLOSED: solo pasa con peligroso === false explícito.
    if (juez) {
      let veredicto;
      try { veredicto = await juez(texto); }
      catch { return caer('juez_error'); } // error/timeout/parse → peligroso por diseño
      if (!veredicto || veredicto.peligroso !== false) return caer(veredicto?.peligroso ? 'juez_peligroso' : 'juez_error');
    }
    return { ...base, texto: texto.trim(), via: 'ia' };
  } catch {
    return caer('ia_error');
  }
}

// Registro mínimo de quiz (MVP: acierto/fallo; NO se domina por 1 acierto → el estado sigue 'visto'
// hasta que el SRS de la fase posterior decida 'dominado'). Devuelve el patch para education_progress.
export function patchQuiz(prev, correcto) {
  const aciertos = (prev?.aciertos || 0) + (correcto ? 1 : 0);
  const errores = (prev?.errores || 0) + (correcto ? 0 : 1);
  return { estado: 'visto', aciertos, errores }; // 'dominado' se difiere al SRS (fase 2)
}

export { leccionDe };
