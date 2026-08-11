// Mapa de event_type de las notificaciones del coach → icono del set canónico + etiqueta corta.
// Contrato del CTO: event_type in { missed_meal, low_protein, streak, weekly_review, user_inactivity }.
export const NOTIF_TYPES = {
  missed_meal: { icon: 'utensils', label: 'Comida' },
  low_protein: { icon: 'flame', label: 'Proteína' },
  streak: { icon: 'star', label: 'Racha' },
  weekly_review: { icon: 'trending', label: 'Resumen' },
  user_inactivity: { icon: 'calendar', label: 'Recordatorio' },
};

export function notifMeta(eventType) {
  return NOTIF_TYPES[eventType] || { icon: 'message', label: 'Coach' };
}

// Tiempo relativo compacto en español desde un ISO. Sin dependencias.
export function haceTiempo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'ahora';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
