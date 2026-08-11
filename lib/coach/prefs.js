// Coach · Proactividad — preferencias de notificación (compartidas por el cron y la API de prefs).
// Fuente única de la verdad de los defaults + un sanitizador PURO (testeable) para el PUT.

export const MODOS = ['tranquilo', 'normal', 'entrenador'];

// Defaults cuando el usuario no tiene fila en coach_notification_prefs (deploy-safe / usuario nuevo).
export const PREFS_DEFAULT = {
  modo: 'normal', quiet_start: 22, quiet_end: 8, proactive_on: true,
  on_missed_meal: true, on_low_protein: true, on_streak: true, on_weekly_review: true,
  on_user_inactivity: true,
};

export const TOGGLES = ['proactive_on', 'on_missed_meal', 'on_low_protein', 'on_streak', 'on_weekly_review', 'on_user_inactivity'];

// Sanea un body del PUT → SOLO campos válidos y con el tipo correcto (nunca confía en el cliente).
// modo ∈ enum · quiet_start/end enteros 0-23 · toggles booleanos. Ignora todo lo demás.
export function sanitizarPrefs(body = {}) {
  const out = {};
  if (typeof body.modo === 'string' && MODOS.includes(body.modo)) out.modo = body.modo;
  for (const k of ['quiet_start', 'quiet_end']) {
    if (body[k] !== undefined) {
      const n = Math.trunc(Number(body[k]));
      if (Number.isFinite(n) && n >= 0 && n <= 23) out[k] = n;
    }
  }
  for (const k of TOGGLES) {
    if (body[k] !== undefined) out[k] = !!body[k];
  }
  return out;
}
