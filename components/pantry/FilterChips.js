'use client';

import Icon from '@/components/ui/Icon';
import { CATEGORIES } from '@/lib/pantry/constants';

// Chips de filtro por categoría (una a la vez). Reutiliza .chip-action del sistema;
// el activo se marca con aria-pressed + estilo brand.
export default function FilterChips({ active = 'all', onChange }) {
  return (
    <div
      className="quick-actions"
      role="group"
      aria-label="Filtrar por categoría"
      style={{ overflowX: 'auto', display: 'flex', gap: 'var(--s2)', flexWrap: 'nowrap' }}
    >
      {CATEGORIES.map((c) => {
        const on = c.id === active;
        return (
          <button
            key={c.id}
            type="button"
            className="chip-action"
            aria-pressed={on}
            onClick={() => onChange(c.id)}
            style={{
              flex: '0 0 auto',
              whiteSpace: 'nowrap',
              borderColor: on ? 'var(--brand)' : 'var(--border)',
              background: on ? 'var(--brand-tint)' : 'var(--surface-2)',
              color: on ? 'var(--brand-strong)' : 'var(--text)',
            }}
          >
            <Icon name={c.icon} size={16} /> {c.label}
          </button>
        );
      })}
    </div>
  );
}
