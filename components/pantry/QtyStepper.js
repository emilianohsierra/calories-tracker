'use client';

import Icon from '@/components/ui/Icon';

// Control de cantidad reutilizable: [−] N unidad [+]. Targets >=44px, aria-label.
export default function QtyStepper({ value = 0, unit = '', step = 1, min = 0, onChange, label = 'Cantidad' }) {
  const set = (v) => onChange?.(Math.max(min, Math.round(v * 100) / 100));

  const btn = {
    width: 'var(--touch)',
    height: 'var(--touch)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--r-md)',
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s3)' }} role="group" aria-label={label}>
      <button type="button" style={btn} onClick={() => set(value - step)} aria-label={`Restar ${step} ${unit}`}>
        <Icon name="minus" size={18} />
      </button>
      <span className="num" aria-live="polite" style={{ minWidth: 64, textAlign: 'center', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
        {value}{unit ? ` ${unit}` : ''}
      </span>
      <button type="button" style={btn} onClick={() => set(value + step)} aria-label={`Sumar ${step} ${unit}`}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}
