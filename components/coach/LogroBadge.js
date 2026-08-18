'use client';

import Icon from '@/components/ui/Icon';

// Badge de logro (estética premium, no infantil). 3 estados:
//  - desbloqueado: círculo teal + icono + nombre.
//  - bloqueado (visible): círculo apagado + icono tenue + nombre (aún por lograr).
//  - oculto: silueta con '?' + "Por descubrir" (curiosidad sana, sin manipular).
export default function LogroBadge({ logro }) {
  const oculto = logro?.oculto && !logro?.desbloqueado;
  const on = !!logro?.desbloqueado;
  const icono = oculto ? null : (logro?.icono || 'star');

  const bg = on ? 'var(--brand-tint)' : 'var(--surface-2)';
  const fg = on ? 'var(--brand-strong)' : 'var(--text-3)';
  const borde = on ? 'var(--brand)' : 'var(--border)';
  const nombre = oculto ? 'Por descubrir' : (logro?.nombre || '');
  const aria = oculto
    ? 'Logro oculto, por descubrir'
    : `Logro ${logro?.nombre || ''}${on ? ', desbloqueado' : ', aún no desbloqueado'}. ${logro?.descripcion || ''}`;

  return (
    <div role="img" aria-label={aria} title={oculto ? 'Logro por descubrir' : logro?.descripcion || logro?.nombre}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 84, textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: bg, border: `1.5px solid ${borde}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: fg, opacity: on || oculto ? 1 : 0.75 }}>
        {oculto ? <span style={{ fontSize: 20, fontWeight: 800 }}>?</span> : <Icon name={icono} size={22} />}
      </div>
      <span className="c-subtitle" style={{ color: on ? 'var(--text)' : 'var(--text-3)', lineHeight: 1.2, fontWeight: on ? 600 : 500 }}>{nombre}</span>
    </div>
  );
}
