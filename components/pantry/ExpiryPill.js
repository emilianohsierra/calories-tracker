'use client';

import Icon from '@/components/ui/Icon';
import { daysUntil, EXPIRY_WARN_DAYS } from '@/lib/pantry/constants';

// Indicador de caducidad. Sereno, nunca alarmante. Nunca solo color (icono + texto).
// >warn: no renderiza (o gris discreto). <=warn: aviso. <0: caducado.
export default function ExpiryPill({ date, showFar = false }) {
  const d = daysUntil(date);
  if (d === null) return null;

  let color = 'var(--text-3)';
  let text;
  if (d < 0) {
    color = 'var(--over)';
    text = 'Caducó';
  } else if (d === 0) {
    color = 'var(--over)';
    text = 'Caduca hoy';
  } else if (d <= EXPIRY_WARN_DAYS) {
    color = 'var(--warn-c)';
    text = `Caduca en ${d} ${d === 1 ? 'día' : 'días'}`;
  } else {
    if (!showFar) return null;
    text = `Caduca en ${d} días`;
  }

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color }}
      aria-label={text}
    >
      <Icon name="calendar" size={12} />
      {text}
    </span>
  );
}
