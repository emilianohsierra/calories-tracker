'use client';

// Tarjeta de entreno (Karpathy §4: bloque `workout`). Cuándo + timing + qué comer.
export default function WorkoutCard({ cuando, timing, sugerencia }) {
  return (
    <div className="c-card c-card--workout">
      <div className="progress-head">
        <span className="c-eyebrow">Entreno</span>
        {cuando ? <span className="c-subtitle">{cuando}</span> : null}
      </div>
      {timing ? <div className="c-title">{timing}</div> : null}
      {sugerencia ? <div className="c-body">{sugerencia}</div> : null}
    </div>
  );
}
