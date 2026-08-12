'use client';

import PorQueChip from '@/components/coach/PorQueChip';

// Tarjeta de consejo (Karpathy §4: bloque `recommendation`). Texto accionable + motivo.
// Afordance "¿Por qué?" (educación on-demand): el backend detecta el concepto del texto; si no
// aplica, el chip degrada en silencio (progressive disclosure, no satura).
export default function RecommendationCard({ texto, motivo, concepto }) {
  if (!texto) return null;
  return (
    <div className="c-card c-card--rec">
      <div className="c-body">{texto}</div>
      {motivo ? <div className="c-subtitle">{motivo}</div> : null}
      <div style={{ marginTop: 'var(--s2)' }}>
        <PorQueChip concepto={concepto} pregunta={concepto ? undefined : [texto, motivo].filter(Boolean).join('. ')} />
      </div>
    </div>
  );
}
