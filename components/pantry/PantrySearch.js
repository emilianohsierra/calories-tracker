'use client';

import Icon from '@/components/ui/Icon';

// Buscador de la despensa. Filtra en vivo (client-side). role="search" + label.
export default function PantrySearch({ value, onChange }) {
  return (
    <div
      role="search"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s2)',
        padding: '0 var(--s4)',
        minHeight: 'var(--touch)',
        borderRadius: 'var(--r-pill)',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
      }}
    >
      <span aria-hidden="true" style={{ color: 'var(--text-3)', display: 'inline-flex' }}>
        <Icon name="search" size={18} />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="¿Qué tienes en tu despensa?"
        aria-label="Buscar en tu despensa"
        style={{ flex: 1, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 15, outline: 'none', minWidth: 0 }}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Limpiar búsqueda" style={{ display: 'inline-flex', border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}>
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
