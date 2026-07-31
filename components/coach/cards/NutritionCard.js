'use client';

import ProgressRing from '@/components/ProgressRing';

// Tarjeta de nutrición (Karpathy §4: bloque `nutrition`). Un anillo por métrica con
// consumido/objetivo y "faltan X u". Reusa ProgressRing (Ola 1). Números del motor.
const META = {
  proteina: { label: 'Proteína', color: 'var(--protein)' },
  calorias: { label: 'Calorías', color: 'var(--brand)' },
  carbohidratos: { label: 'Carbohidratos', color: 'var(--carbs)' },
  grasa: { label: 'Grasa', color: 'var(--fat)' },
  agua: { label: 'Agua', color: 'var(--water)' },
  fibra: { label: 'Fibra', color: 'var(--fiber)' },
};

export default function NutritionCard({ metrica, consumido = 0, objetivo = 0, pendiente = 0, unidad = '' }) {
  const meta = META[metrica] || { label: metrica || 'Nutriente', color: 'var(--brand)' };
  return (
    <div className="c-card c-card--nutrition">
      <ProgressRing value={consumido} goal={objetivo || 1} size={92} stroke={9} color={meta.color} track="var(--surface-2)">
        <span className="c-data num" style={{ fontSize: 15 }}>{Math.round(consumido)}</span>
        <span className="ring-caption num">de {Math.round(objetivo)}</span>
      </ProgressRing>
      <div className="c-card__body">
        <div className="c-title">{meta.label}</div>
        {pendiente > 0 ? (
          <div className="c-subtitle num">Te faltan {Math.round(pendiente)} {unidad}</div>
        ) : (
          <div className="c-subtitle">Meta cubierta</div>
        )}
      </div>
    </div>
  );
}
