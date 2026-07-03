'use client';

import { useState } from 'react';
import { fmt } from '@/lib/format';

const W = 520;
const H = 180;
const PAD = { top: 26, right: 10, bottom: 24, left: 10 };
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

// Barra con extremo de datos redondeado (4px) y base cuadrada sobre la línea base.
function barPath(x, yTop, w, yBase) {
  const r = Math.min(4, (yBase - yTop) / 2, w / 2);
  return [
    `M ${x} ${yBase}`,
    `L ${x} ${yTop + r}`,
    `Q ${x} ${yTop} ${x + r} ${yTop}`,
    `L ${x + w - r} ${yTop}`,
    `Q ${x + w} ${yTop} ${x + w} ${yTop + r}`,
    `L ${x + w} ${yBase}`,
    'Z',
  ].join(' ');
}

export default function WeekChart({ days, goal, selectedDate, onSelectDay }) {
  const [hover, setHover] = useState(null);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const yBase = H - PAD.bottom;
  const maxVal = Math.max(goal * 1.1, ...days.map((d) => d.calories), 1);
  const yFor = (v) => yBase - (v / maxVal) * plotH;

  const step = plotW / days.length;
  const barW = Math.min(24, step * 0.55);
  const goalY = yFor(goal);

  return (
    <section className="card" aria-label="Calorías de los últimos 7 días">
      <h3 className="card-title">Últimos 7 días · kcal por día</h3>
      <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Gráfica de barras de calorías diarias">
          {/* línea base */}
          <line x1={PAD.left} y1={yBase} x2={W - PAD.right} y2={yBase} stroke="var(--baseline)" strokeWidth="1" />
          {/* línea de referencia: meta */}
          <line x1={PAD.left} y1={goalY} x2={W - PAD.right} y2={goalY} stroke="var(--gridline)" strokeWidth="1" />
          <text x={W - PAD.right} y={goalY - 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)">
            Meta {fmt(goal)}
          </text>

          {days.map((d, i) => {
            const cx = PAD.left + step * i + step / 2;
            const x = cx - barW / 2;
            const yTop = yFor(d.calories);
            const isSelected = d.date === selectedDate;
            const weekday = WEEKDAYS[new Date(`${d.date}T00:00:00`).getDay()];
            return (
              <g key={d.date}>
                {d.calories > 0 && (
                  <path d={barPath(x, yTop, barW, yBase)} fill="var(--accent)" />
                )}
                {isSelected && d.calories > 0 && (
                  <text x={cx} y={yTop - 6} textAnchor="middle" fontSize="11" fill="var(--ink-secondary)" fontWeight="600">
                    {fmt(d.calories)}
                  </text>
                )}
                <text
                  x={cx}
                  y={H - 7}
                  textAnchor="middle"
                  fontSize="11"
                  fill={isSelected ? 'var(--ink)' : 'var(--ink-muted)'}
                  fontWeight={isSelected ? '700' : '400'}
                >
                  {weekday}
                </text>
                {/* zona de interacción de toda la columna */}
                <rect
                  x={PAD.left + step * i}
                  y={PAD.top - 10}
                  width={step}
                  height={plotH + 10}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover({ i, xPct: (cx / W) * 100, yPct: (Math.min(yTop, goalY) / H) * 100 })}
                  onClick={() => onSelectDay(d.date)}
                />
              </g>
            );
          })}
        </svg>

        {hover !== null && (
          <div className="chart-tooltip" style={{ left: `${hover.xPct}%`, top: `calc(${hover.yPct}% - 8px)` }}>
            <span className="tt-label">
              {new Date(`${days[hover.i].date}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' })}
              {' · '}
            </span>
            {fmt(days[hover.i].calories)} kcal
          </div>
        )}
      </div>
    </section>
  );
}
