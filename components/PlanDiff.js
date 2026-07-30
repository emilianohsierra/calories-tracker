'use client';

// Diff del plan antes→después (Rams §4). Muestra el delta con color neutro (subida/bajada
// no es "malo"). Si no hay plan previo o no cambió nada, no muestra deltas ruidosos.
const ROWS = [
  { key: 'kcal_target', label: 'Calorías', unit: 'kcal' },
  { key: 'protein_g', label: 'Proteína', unit: 'g' },
  { key: 'carbs_g', label: 'Carbos', unit: 'g' },
  { key: 'fat_g', label: 'Grasa', unit: 'g' },
];

export default function PlanDiff({ prev, next }) {
  if (!next) return null;
  const changed = prev && ROWS.some((r) => prev[r.key] !== next[r.key]);

  return (
    <section className="tip-card" aria-label="Cambios en tu plan">
      <span className="tip-eyebrow">{changed ? 'Tu plan cambió' : 'Tu plan'}</span>
      <p className="tip-body" style={{ margin: 'var(--s2) 0 var(--s3)' }}>
        Ajusté tu plan a tus nuevos datos.
      </p>
      <table className="plan-table">
        <tbody>
          {ROWS.map((r) => {
            const nv = next[r.key];
            const pv = prev ? prev[r.key] : null;
            const delta = pv != null ? nv - pv : null;
            return (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {pv != null && pv !== nv ? `${pv} → ` : ''}
                  {nv} {r.unit}
                </td>
                <td className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                  {delta != null && delta !== 0 ? `(${delta > 0 ? '+' : ''}${delta})` : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
