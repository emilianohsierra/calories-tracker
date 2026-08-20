'use client';

// Barra de progreso premium para un macro. Reusa los tokens de nutriente ya vivos
// (--protein/--carbs/--fat + --*-track). Sin CSS nuevo: estilos inline con tokens.
export default function MacroBar({ label, value = 0, goal = 0, color = 'var(--brand)', track = 'var(--surface-2)' }) {
  const v = Math.round(value || 0);
  const g = Math.round(goal || 0);
  const pct = g > 0 ? Math.min(v / g, 1) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="c-subtitle">{label}</span>
        <span className="num c-subtitle" style={{ fontWeight: 600, color: 'var(--text)' }}>
          {v} / {g} g
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={g}
        aria-label={`${label}: ${v} de ${g} gramos`}
        style={{ height: 8, borderRadius: 'var(--r-pill)', background: track, overflow: 'hidden' }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct * 100}%`,
            background: color,
            borderRadius: 'var(--r-pill)',
            transition: 'width var(--dur-ring) var(--ease-spring)',
          }}
        />
      </div>
    </div>
  );
}
