const nf = new Intl.NumberFormat('es-MX');

export function fmt(n) {
  return nf.format(Math.round(n));
}

export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return localDateStr(d);
}

export function dateLabel(dateStr) {
  const today = localDateStr();
  if (dateStr === today) return 'Hoy';
  if (dateStr === addDays(today, -1)) return 'Ayer';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function currentTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
