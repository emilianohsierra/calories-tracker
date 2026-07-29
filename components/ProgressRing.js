'use client';

// Anillo de progreso en SVG. value/goal → arco. Sin dependencias.
export default function ProgressRing({
  value = 0,
  goal = 1,
  size = 160,
  stroke = 14,
  color = 'var(--brand)',
  track = 'var(--brand-tint)',
  children,
  label,
}) {
  const safeGoal = goal > 0 ? goal : 1;
  const pct = Math.max(0, Math.min(value / safeGoal, 1));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size }} className="ring-anim">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="presentation">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset var(--dur-ring) var(--ease-spring)' }}
          />
        </svg>
        {children && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {children}
          </div>
        )}
      </div>
      {label && <span className="ring-label">{label}</span>}
    </div>
  );
}
