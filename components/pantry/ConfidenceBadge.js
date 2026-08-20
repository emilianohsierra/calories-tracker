'use client';

import Icon from '@/components/ui/Icon';
import { confidenceOf } from '@/lib/pantry/constants';

// Badge de confianza (3 niveles). NUNCA solo color: punto + icono + (texto) + aria.
// compact=true → solo punto+icono (para la card); false → punto+icono+etiqueta+fuente.
export default function ConfidenceBadge({ level, compact = false }) {
  const c = confidenceOf(level);

  if (compact) {
    return (
      <span
        role="img"
        aria-label={c.aria}
        title={c.label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 6px',
          borderRadius: 'var(--r-pill)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: c.color,
          fontSize: 13, /* Ola1-S6: sello ≥13px (antes 11) */
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
        <Icon name={c.icon} size={12} />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={c.aria}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: c.color, fontWeight: 600 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
        <Icon name={c.icon} size={14} />
        {c.label}
      </span>
      <span style={{ color: 'var(--text-3)' }}>· {c.source}</span>
    </span>
  );
}
