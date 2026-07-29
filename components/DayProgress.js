'use client';

import ProgressRing from '@/components/ProgressRing';

// Héroe de datos del día: anillo grande de kcal + 3 mini-anillos de macros.
// Consume totales del día (de /api/meals) y los targets (de /api/profile → nutrition_targets).
export default function DayProgress({ totals, targets }) {
  const kcalGoal = targets?.kcal_target || 2000;
  const kcal = Math.round(totals?.calories || 0);
  const remaining = kcalGoal - kcal;

  const state = kcal > kcalGoal * 1.05 ? 'over' : kcal > kcalGoal * 0.9 ? 'warn' : 'ok';
  const color = state === 'over' ? 'var(--over)' : state === 'warn' ? 'var(--warn-c)' : 'var(--brand)';
  const msg =
    state === 'over'
      ? `Te pasaste por ${Math.abs(remaining)} kcal — mañana es otro día.`
      : `Vas bien: te quedan ${Math.max(remaining, 0)} kcal.`;

  const macros = [
    { key: 'protein', label: 'Proteína', value: totals?.protein_g, goal: targets?.protein_g, color: 'var(--protein)', track: '#F6D9CF' },
    { key: 'carbs', label: 'Carbos', value: totals?.carbs_g, goal: targets?.carbs_g, color: 'var(--carbs)', track: '#FBEAC9' },
    { key: 'fat', label: 'Grasa', value: totals?.fat_g, goal: targets?.fat_g, color: 'var(--fat)', track: '#D8DCFB' },
  ];

  return (
    <section aria-label="Progreso del día" style={{ marginBottom: 'var(--s4)' }}>
      <div className="rings-row">
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={kcalGoal}
          aria-valuenow={kcal}
          aria-label="Calorías del día"
        >
          <ProgressRing value={kcal} goal={kcalGoal} size={170} stroke={16} color={color}>
            <span className="num" style={{ fontSize: 40, lineHeight: '44px', fontWeight: 700, color: 'var(--text)' }}>
              {kcal}
            </span>
            <span className="ring-caption">de {kcalGoal} kcal</span>
          </ProgressRing>
        </div>
      </div>
      <p className="ring-caption" style={{ textAlign: 'center', margin: 'var(--s2) 0 var(--s4)' }}>
        {msg}
      </p>
      <div className="mini-rings" style={{ justifyContent: 'center' }}>
        {macros.map((m) => (
          <ProgressRing
            key={m.key}
            value={Math.round(m.value || 0)}
            goal={m.goal || 1}
            size={64}
            stroke={7}
            color={m.color}
            track={m.track}
            label={`${m.label}`}
          >
            <span className="num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
              {Math.round(m.value || 0)}
            </span>
          </ProgressRing>
        ))}
      </div>
    </section>
  );
}
