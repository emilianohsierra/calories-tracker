// Gamificación V1 — NÚCLEO PURO (0 IA, determinista, testeable): tipos de evento, XP, clave-dedupe,
// nivel, desbloqueo de logros y GUARDIAS TCA. No toca DB; el otorgamiento atómico/idempotente vive en
// la RPC otorgar_evento (supabase/gamificacion-v1.sql) y el wrapper server en otorgar.js.
//
// REGLA DURA (Karpathy): jamás XP/logro/racha por comer poco/saltarse/déficit/peso. Los eventos de kcal
// pasan por la guardia (piso de seguridad + EN RANGO); comer por debajo NUNCA da XP.
import { pisoKcal } from '../nutrition/formulas';
import { XP, NIVELES, LOGROS, RANGO } from './config';

export const EVENTOS = {
  MEAL_LOGGED: 'MEAL_LOGGED',
  DAY_COMPLETED: 'DAY_COMPLETED',
  WORKOUT_LOGGED: 'WORKOUT_LOGGED',
  LESSON_COMPLETED: 'LESSON_COMPLETED',
  CHECKIN_COMPLETED: 'CHECKIN_COMPLETED',
  CHALLENGE_COMPLETED: 'CHALLENGE_COMPLETED', // V2 (declarado para extensibilidad)
  PANTRY_ITEM_ADDED: 'PANTRY_ITEM_ADDED',
  GOAL_REACHED: 'GOAL_REACHED',
  WEEKLY_CONSISTENT: 'WEEKLY_CONSISTENT',
};

// XP del evento (0 si no está en config → no otorga).
export function xpDe(tipo) {
  return Number.isFinite(XP[tipo]) ? XP[tipo] : 0;
}

// Clave de dedupe DETERMINISTA (anti-doble-conteo, y la RPC la usa para validar la acción real).
//   MEAL_LOGGED     → meal:<id>        LESSON_COMPLETED → leccion:<concepto>
//   PANTRY_ITEM_ADDED → pantry:<id>    WORKOUT_LOGGED   → entreno:<dia>
//   CHECKIN_COMPLETED → checkin:<dia>  DAY_COMPLETED    → dia:<dia>
//   GOAL_REACHED    → goal:<dia>       WEEKLY_CONSISTENT→ semana:<iso>
export function claveDedupe(tipo, ref) {
  const r = String(ref ?? '');
  switch (tipo) {
    case EVENTOS.MEAL_LOGGED: return `meal:${r}`;
    case EVENTOS.LESSON_COMPLETED: return `leccion:${r}`;
    case EVENTOS.PANTRY_ITEM_ADDED: return `pantry:${r}`;
    case EVENTOS.WORKOUT_LOGGED: return `entreno:${r}`;
    case EVENTOS.CHECKIN_COMPLETED: return `checkin:${r}`;
    case EVENTOS.DAY_COMPLETED: return `dia:${r}`;
    case EVENTOS.GOAL_REACHED: return `goal:${r}`;
    case EVENTOS.WEEKLY_CONSISTENT: return `semana:${r}`;
    default: return `${tipo}:${r}`;
  }
}

// Clave de dedupe CANÓNICA (espejo de la RPC otorgar_evento, supabase/gamificacion-v1.sql): la RPC NO
// dedupea con el p_clave_dedupe raw del cliente, sino con `tipo:v_ref` derivado de inputs YA validados
// (v_ref = 2º campo de la clave = la referencia real). Así una acción real = un solo award, sin importar
// el sufijo basura que mande el cliente. Se expone para testear el invariante (Slowking residual).
export function claveCanonica(tipo, claveDedupeRaw) {
  const ref = String(claveDedupeRaw ?? '').split(':')[1] || '';
  return `${tipo}:${ref}`;
}

// Nivel a partir del XP total (nombre renombrable). Devuelve { n, nombre, min, siguiente? }.
export function nivelDe(xpTotal) {
  const xp = Math.max(0, Number(xpTotal) || 0);
  let actual = NIVELES[0];
  for (const nv of NIVELES) if (xp >= nv.min) actual = nv;
  const siguiente = NIVELES.find((nv) => nv.min > actual.min) || null;
  return { n: actual.n, nombre: actual.nombre, min: actual.min, xp, siguiente: siguiente ? { n: siguiente.n, nombre: siguiente.nombre, min: siguiente.min, faltan: Math.max(0, siguiente.min - xp) } : null };
}

// Logros cuyo criterio se cumple con el estado agregado (determinista). `estado` = conducta agregada
// (racha, lecciones, prot_meta_dias, rango_dias, despensa_items, entrenos, ...). NUNCA mira peso.
export function logrosDe(estado = {}) {
  return LOGROS.filter((l) => { try { return !!l.criterio(estado); } catch { return false; } }).map((l) => l.code);
}
// Metadata de un logro (para el contrato de Rams: nombre/desc/categoria/oculto).
export function logroMeta(code) {
  return LOGROS.find((l) => l.code === code) || null;
}

// ── GUARDIAS TCA (Karpathy §0/§5). Cifras del motor; el piso hereda de lib/nutrition. ──
// consumido/target en kcal; prot/protTarget en g; bmr/sexo para el piso de seguridad.
export function pisoSeguridad(bmr, sexo) {
  const b = Number(bmr);
  if (!Number.isFinite(b) || b <= 0) return sexo === 'female' ? 1200 : 1500; // sin BMR → piso por sexo
  return pisoKcal(b, sexo);
}
// EN RANGO = banda [0.85, 1.15]·target Y >= piso (premia estar en rango, NO comer de menos).
export function enRangoKcal({ consumido, target, piso }) {
  const c = Number(consumido); const t = Number(target); const p = Number(piso) || 0;
  if (!Number.isFinite(c) || !Number.isFinite(t) || t <= 0) return false;
  return c >= RANGO.INF * t && c <= RANGO.SUP * t && c >= p;
}
// UNDER_EATING = por debajo del piso o por debajo del 70% de la meta → JAMÁS da XP; dispara check-in de apoyo.
export function underEating({ consumido, target, piso }) {
  const c = Number(consumido); const t = Number(target); const p = Number(piso) || 0;
  if (!Number.isFinite(c)) return false;
  if (p > 0 && c < p) return true;
  if (Number.isFinite(t) && t > 0 && c < RANGO.UNDER_META * t) return true;
  return false;
}
// Proteína en meta (aditivo): prot >= 0.90·protTarget. No mira kcal (sumar proteína siempre es sano).
export function proteinaEnMeta({ prot, protTarget }) {
  const p = Number(prot); const t = Number(protTarget);
  return Number.isFinite(p) && Number.isFinite(t) && t > 0 && p >= RANGO.PROT_META * t;
}

// ¿Este evento de kcal puede otorgarse? GOAL_REACHED (calorias en rango) exige EN RANGO y nunca under-eating.
// Eventos que NO miran kcal (registro/lección/entreno/despensa/racha) siempre pasan la guardia.
export function permiteOtorgar(tipo, ctxKcal = null) {
  if (tipo !== EVENTOS.GOAL_REACHED) return true; // el único evento kcal-sensible en V1
  if (!ctxKcal) return false;
  if (underEating(ctxKcal)) return false;          // comer por debajo → 0 XP
  return enRangoKcal(ctxKcal);                     // premia RANGO, no debajo
}
