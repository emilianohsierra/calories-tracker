'use client';

import Icon from '@/components/ui/Icon';

// UNA línea conversacional del coach. Si onAsk existe, toda la línea abre el chat.
export default function CoachLine({ text, onAsk }) {
  if (!text) return null;

  const inner = (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: 'var(--s3) var(--s4)',
        borderRadius: 'var(--r-md)',
        background: 'var(--brand-tint)',
      }}
    >
      <span style={{ flexShrink: 0, marginTop: 1, color: 'var(--brand-strong)' }}>
        <Icon name="message" size={18} />
      </span>
      <span className="c-body" style={{ color: 'var(--text)' }}>
        {text}
      </span>
    </div>
  );

  if (!onAsk) return inner;

  return (
    <button
      type="button"
      onClick={onAsk}
      aria-label="Pregúntale a tu coach sobre esto"
      style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
    >
      {inner}
    </button>
  );
}
