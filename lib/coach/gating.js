// Estado de Pro-gating del coach para la UI (mostrar el muro DESPUÉS del valor).
// El gate DURO es server-side (429 del /api/coach/chat vía consumir_ia); estos helpers son
// para que la UI decida qué pintar (badge, aviso 80%) sin adivinar el bloqueo.
export function isPro(usage) {
  return usage?.plan === 'pro';
}

// Mensajes de coach que le quedan al usuario. Pro = ilimitado (Infinity). Free = `remaining`
// del feature chat si el backend lo expuso (respuesta del chat); si aún no se conoce,
// Infinity (no pre-bloquear: el server decide al enviar).
export function limiteRestanteCoach(usage) {
  if (isPro(usage)) return Infinity;
  const r = usage?.coach?.remaining;
  return Number.isFinite(r) ? Math.max(0, r) : Infinity;
}

// ¿Puede usar el coach ahora? Pro siempre; Free mientras le quede degustación (o no se
// conozca aún). El bloqueo REAL lo confirma el 429 del backend al enviar.
export function canUseCoach(usage) {
  return isPro(usage) || limiteRestanteCoach(usage) > 0;
}
