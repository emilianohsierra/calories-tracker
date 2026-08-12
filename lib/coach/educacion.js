// Coach · Educación — gate de anti-saturación (intención), back-off de ofertas, y el builder del
// "por qué" adaptativo. La BASE de cada explicación es DETERMINISTA (curriculum, correcta y TCA-safe);
// Haiku SOLO la personaliza con los números reales del usuario y pasa por el MISMO post-check
// anti-TCA/peso que redactar.js (reuso, no duplico); si deriva → cae a la base determinista.
import { explicacionDe, leccionDe } from './curriculum';
import { verificarEducacionIA } from './verificarEducacionIA';

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

// ORQUESTA el "por qué" con dependencias INYECTADAS (testeable). Base determinista SIEMPRE segura;
// Haiku opcional personaliza y pasa por el post-check anti-TCA (verificarNudgeIA); si falla o no hay
// IA/cap → base. Devuelve { texto, titulo, nivel, via:'ia'|'determinista' }.
export async function explicarConcepto(deps, { concepto, nivel, ctx } = {}) {
  const base = explicacionBase(concepto, nivel, ctx);
  if (!base) return null;
  const { anthropic, reservar, reembolsar, redactar } = deps || {};
  if (!anthropic || !reservar || !redactar) return { ...base, via: 'determinista' };
  const gate = await reservar();
  if (!gate?.allowed) return { ...base, via: 'determinista' }; // kill/cap → base (0 llamada al modelo)
  try {
    const texto = await redactar(base);
    // POST-CHECK EDUCATIVO (Fase B.5): permite vocabulario educativo neutro, bloquea solo TCA real,
    // y protege las cifras REALES del motor. NO reusa verificarNudgeIA (sobre-filtra la educación).
    const chk = verificarEducacionIA(texto, base.texto);
    if (chk.ok) return { ...base, texto: texto.trim(), via: 'ia' };
    await reembolsar();
    return { ...base, via: 'determinista' };
  } catch {
    await reembolsar();
    return { ...base, via: 'determinista' };
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
