// Coach · Proactividad Fase 1 — TRIGGERS DETERMINISTAS (0 IA, 0 cifras del modelo).
//
// Cada evaluador es una FUNCIÓN PURA (facts) → Nudge | null. Los `facts` los arma el cron
// (app/api/coach/cron/tick) reusando el MOTOR (lib/coach/briefing.js → getHomeBriefing) y una
// query de fechas de registro para la racha. Ninguna función aquí toca red ni modelo → 100%
// unit-testables. El cuerpo del nudge se construye con las cifras que ya vienen del motor.
//
// GUARDRAILS (invariantes de producto, plan/proactividad-mvp-producto.md §5):
//  · Marco de "AÑADIR, no restringir": los nudges empujan acciones positivas (registrar, sumar
//    proteína), NUNCA "te pasaste"/"vas mal"/metas de báscula.
//  · Racha = de HÁBITO (registro), no de dieta: no se rompe por comer de más; hay día de gracia.
//  · Tono amable en missed_meal: invitación, no reproche.

export const UMBRAL_PROTEINA_G = 25;   // g pendientes para que valga la pena empujar proteína
export const HITOS_RACHA = [7, 14, 30]; // hitos que se celebran
export const RACHA_MIN_RIESGO = 3;      // racha (hasta ayer) a partir de la cual avisamos "en riesgo"
// OBS-2 · piso de hora LOCAL (America/Mexico_City) para los recordatorios de tarde/noche
// (missed_meal, low_protein). Defensa: aunque cambie el schedule/tz del cron, un "aún no registras
// nada hoy" JAMÁS sale por la mañana. streak/weekly_review no dependen de la hora.
export const PISO_HORA_RECORDATORIO = 18;

export const PRIORIDAD = { BAJA: 0, MEDIA: 1, ALTA: 2 };

// Presupuesto de nudges/día por modo (anti-spam). Al agotarse, solo pasan prioridad ALTA.
export const MODO_BUDGET = { tranquilo: 1, normal: 3, entrenador: 5 };

export const EVENT_TYPES = ['missed_meal', 'low_protein', 'streak', 'weekly_review'];
// Mapa event_type → columna de toggle en coach_notification_prefs.
export const TOGGLE_COL = {
  missed_meal: 'on_missed_meal',
  low_protein: 'on_low_protein',
  streak: 'on_streak',
  weekly_review: 'on_weekly_review',
};

const r = (n) => Math.round(Number.isFinite(Number(n)) ? Number(n) : 0);

// ── Trigger 1 · missed_meal ──────────────────────────────────────────────────
// Dispara si el usuario NO registró NADA hoy Y ya es tarde/noche (piso de hora local). Tono amable.
export function evalMissedMeal({ consumido, horaLocal }) {
  if (!(r(horaLocal) >= PISO_HORA_RECORDATORIO)) return null; // OBS-2: nunca por la mañana
  if (!consumido || consumido.kcal > 0) return null; // ya registró algo → no aplica
  return {
    event_type: 'missed_meal',
    prioridad: PRIORIDAD.MEDIA,
    titulo: 'Aún no registras nada hoy',
    cuerpo: 'Cuéntame qué comiste y lo cuadro contigo. Un registro rápido mantiene tu día al día.',
  };
}

// ── Trigger 2 · low_protein ──────────────────────────────────────────────────
// Dispara si YA registró algo hoy pero le falta proteína (>= umbral) para su meta del MOTOR.
// Cifras 100% del motor (objetivo/consumido). Marco de "añadir". También es recordatorio de tarde
// → mismo piso de hora local que missed_meal (OBS-2).
export function evalLowProtein({ objetivo, consumido, horaLocal }) {
  if (!(r(horaLocal) >= PISO_HORA_RECORDATORIO)) return null; // OBS-2: no antes de la tarde
  if (!objetivo || !consumido) return null;
  if (consumido.kcal <= 0) return null;                 // sin registro hoy → lo cubre missed_meal
  const pend = r(objetivo.protein_g) - r(consumido.protein_g);
  if (pend < UMBRAL_PROTEINA_G) return null;
  return {
    event_type: 'low_protein',
    prioridad: PRIORIDAD.MEDIA,
    titulo: 'Te falta proteína para cerrar tu día',
    cuerpo: `Vas ${r(consumido.protein_g)} de ${r(objetivo.protein_g)} g de proteína. Te faltan ${pend} g; una cena con proteína lo cierra.`,
  };
}

// ── Trigger 3 · streak (racha de HÁBITO) ─────────────────────────────────────
// facts: { rachaHoy, rachaAyer, registroHoy }
//  · Celebración: registró hoy Y la racha cae en un hito (7/14/30) → prioridad MEDIA.
//  · En riesgo: NO registró hoy Y la racha hasta ayer >= RACHA_MIN_RIESGO → prioridad ALTA
//    (día de gracia: registrar hoy la salva). Nunca castiga; empuja a registrar.
export function evalStreak({ rachaHoy, rachaAyer, registroHoy }) {
  if (registroHoy && HITOS_RACHA.includes(rachaHoy)) {
    return {
      event_type: 'streak',
      prioridad: PRIORIDAD.MEDIA,
      titulo: `¡Racha de ${rachaHoy} días!`,
      cuerpo: `Llevas ${rachaHoy} días seguidos registrando. Ese hábito es lo que mueve la aguja. Sigue así.`,
    };
  }
  if (!registroHoy && rachaAyer >= RACHA_MIN_RIESGO) {
    return {
      event_type: 'streak',
      prioridad: PRIORIDAD.ALTA,
      titulo: 'Tu racha está en riesgo',
      cuerpo: `Llevas ${rachaAyer} días seguidos registrando. Registra algo hoy para no perder la racha.`,
    };
  }
  return null;
}

// ── Trigger 4 · weekly_review (Pro) ──────────────────────────────────────────
// facts: { esDiaReporte, isPro, diasConRegistro, kcalPromedio }
// Solo dispara el día del reporte y SOLO para Pro (gating). Cuerpo determinista sobre agregados.
export function evalWeeklyReview({ esDiaReporte, isPro, diasConRegistro, kcalPromedio }) {
  if (!esDiaReporte || !isPro) return null;
  const dias = r(diasConRegistro);
  const kcal = r(kcalPromedio);
  const cuerpo = dias > 0
    ? `Esta semana registraste ${dias}/7 días, con un promedio de ${kcal} kcal al día. Abre tu coach para ver el detalle.`
    : 'Esta semana no registraste días. Retomar hoy con una comida ya es un buen paso; tu coach te ayuda.';
  return {
    event_type: 'weekly_review',
    prioridad: PRIORIDAD.MEDIA,
    titulo: 'Tu resumen de la semana',
    cuerpo,
  };
}

// ── Anti-spam · quiet hours (tz-aware; la hora local la calcula el cron) ──────
// Devuelve true si `hora` (0-23) cae dentro de la franja de silencio [start, end).
// Maneja el wraparound nocturno (p.ej. 22→8). Si start === end → nunca silencia.
export function enQuietHours(hora, start, end) {
  const h = ((r(hora) % 24) + 24) % 24;
  const s = ((r(start) % 24) + 24) % 24;
  const e = ((r(end) % 24) + 24) % 24;
  if (s === e) return false;
  if (s < e) return h >= s && h < e;      // franja diurna simple
  return h >= s || h < e;                  // franja que cruza medianoche
}

// ── Anti-spam · presupuesto por modo + prioridad ─────────────────────────────
// Ordena los nudges candidatos por prioridad desc y toma hasta (budget - yaEnviadosHoy).
// Al agotar el presupuesto SOLO pasan los de prioridad ALTA (racha en riesgo / seguridad).
export function seleccionarPorPresupuesto(nudges, modo, yaEnviadosHoy = 0) {
  const budget = MODO_BUDGET[modo] ?? MODO_BUDGET.normal;
  const restante = Math.max(0, budget - r(yaEnviadosHoy));
  const orden = [...(nudges || [])].sort((a, b) => (b.prioridad - a.prioridad));
  const out = [];
  for (const n of orden) {
    if (out.length < restante) { out.push(n); continue; }
    if (n.prioridad >= PRIORIDAD.ALTA) out.push(n); // los ALTA saltan el presupuesto agotado
  }
  return out;
}

// ── Racha de hábito a partir de las fechas con registro ──────────────────────
// fechas: Set<'YYYY-MM-DD'> con al menos un registro. hoy: 'YYYY-MM-DD'.
// Devuelve { rachaHoy, rachaAyer, registroHoy }:
//   rachaHoy  = días consecutivos terminando HOY (0 si hoy no tiene registro).
//   rachaAyer = días consecutivos terminando AYER (para "en riesgo" con día de gracia).
export function calcularRacha(fechas, hoy) {
  const set = fechas instanceof Set ? fechas : new Set(fechas || []);
  const registroHoy = set.has(hoy);
  const contarDesde = (d) => {
    let s = 0;
    let cur = d;
    while (set.has(cur)) { s += 1; cur = diaPrevio(cur); }
    return s;
  };
  const rachaHoy = registroHoy ? contarDesde(hoy) : 0;
  const rachaAyer = contarDesde(diaPrevio(hoy));
  return { rachaHoy, rachaAyer, registroHoy };
}

// 'YYYY-MM-DD' → día anterior en 'YYYY-MM-DD' (UTC-safe, sin depender de la tz del runtime).
export function diaPrevio(fecha) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// dedupe_key legible para logs (la unicidad real la da el UNIQUE(user_id,event_type,dia,slot)).
export function dedupeKey(event_type, dia, slot = '') {
  return `${event_type}:${dia}${slot ? `:${slot}` : ''}`;
}
