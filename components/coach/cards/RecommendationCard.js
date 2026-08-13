'use client';

import PorQueChip from '@/components/coach/PorQueChip';
import { conceptoDeTexto } from '@/lib/coach/curriculum';

// Tarjeta de consejo (Karpathy §4: bloque `recommendation`). Texto accionable + motivo.
// Afordance "¿Por qué?": SIEMPRE manda un CONCEPTO whitelisteado (proteina/deficit/macros/calidad),
// NUNCA el texto de la tarjeta como pregunta libre (ese texto lo genera el modelo y disparaba el
// guard de salud → derivaba por error). Si no hay concepto whitelisteado, se oculta el chip
// (progressive disclosure: no hay un concepto general que explicar).
export default function RecommendationCard({ texto, motivo, concepto }) {
  if (!texto) return null;
  const c = (typeof concepto === 'string' && concepto) || conceptoDeTexto([texto, motivo].filter(Boolean).join(' '));
  return (
    <div className="c-card c-card--rec">
      <div className="c-body">{texto}</div>
      {motivo ? <div className="c-subtitle">{motivo}</div> : null}
      {c && (
        <div style={{ marginTop: 'var(--s2)' }}>
          <PorQueChip concepto={c} />
        </div>
      )}
    </div>
  );
}
