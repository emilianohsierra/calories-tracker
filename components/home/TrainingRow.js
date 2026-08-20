'use client';

import Icon from '@/components/ui/Icon';

// Píldora "qué entrenas hoy". Contrato real de Karpathy: { title, when } | string | null.
// Si entreno es null (sin dato / descanso), muestra "Descanso hoy".
export default function TrainingRow({ entreno }) {
  const label = !entreno
    ? 'Descanso hoy'
    : typeof entreno === 'string'
      ? entreno
      : [entreno.title, entreno.when].filter(Boolean).join(' · ') || 'Descanso hoy';

  return (
    <div
      className="c-subtitle"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'flex-start',
        padding: '6px 12px',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface-2)',
        color: 'var(--text)', // override del rol: la píldora usa el texto más fuerte
      }}
    >
      <span style={{ display: 'inline-flex', color: 'var(--brand-strong)' }}>
        <Icon name="activity" size={16} />
      </span>
      {label}
    </div>
  );
}
