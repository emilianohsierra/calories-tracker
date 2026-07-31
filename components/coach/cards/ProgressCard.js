'use client';

// Tarjeta de progreso (Karpathy §4: bloque `progress`). Métrica + valor + tendencia.
// Flecha lineal (SVG), nunca emoji.
const ARROWS = {
  sube: { d: 'M4 14 L8 6 L12 14', color: 'var(--ok)' },
  baja: { d: 'M4 6 L8 14 L12 6', color: 'var(--over)' },
  estable: { d: 'M4 10 L12 10', color: 'var(--text-3)' },
};

export default function ProgressCard({ metrica, valor, tendencia = 'estable', contexto }) {
  const arrow = ARROWS[tendencia] || ARROWS.estable;
  return (
    <div className="c-card c-card--progress">
      <div className="progress-head">
        <span className="c-eyebrow">{metrica}</span>
        <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true">
          <path d={arrow.d} fill="none" stroke={arrow.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="c-data num" style={{ fontSize: 20 }}>{valor}</div>
      {contexto ? <div className="c-subtitle">{contexto}</div> : null}
    </div>
  );
}
