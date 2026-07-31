'use client';

// Tarjeta de consejo (Karpathy §4: bloque `recommendation`). Texto accionable + motivo.
export default function RecommendationCard({ texto, motivo }) {
  if (!texto) return null;
  return (
    <div className="c-card c-card--rec">
      <div className="c-body">{texto}</div>
      {motivo ? <div className="c-subtitle">{motivo}</div> : null}
    </div>
  );
}
