'use client';

import { useId, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { explicar } from '@/lib/coach/eduClient';

// Afordance discreto "¿Por qué?" en tarjetas de recomendación del coach. 1 tap → POST /explicar
// → explicación adaptada al nivel + línea de datos reales (todo del backend, la UI no inventa).
// Progressive disclosure (colapsado por defecto). Deploy-safe: si falla o no hay concepto, degrada.
export default function PorQueChip({ concepto, pregunta }) {
  const panelId = useId();
  const [estado, setEstado] = useState('idle'); // idle | loading | open | vacio
  const [data, setData] = useState(null);

  const abrir = async () => {
    if (estado === 'open') { setEstado('idle'); return; } // toggle cerrar
    if (data) { setEstado('open'); return; }
    setEstado('loading');
    const r = await explicar(concepto ? { concepto } : { pregunta });
    // no_concepto / error / null → degradar en silencio (mensaje suave, sin romper la card)
    if (!r || r._error || (!r.texto && !r.derivar)) { setEstado('vacio'); return; }
    setData(r);
    setEstado('open');
  };

  return (
    <div>
      <button
        type="button"
        className="chip-action"
        onClick={abrir}
        aria-expanded={estado === 'open'}
        aria-controls={panelId}
        style={{ minHeight: 'var(--touch)', fontSize: 13, gap: 5 }}
      >
        <Icon name="info" size={14} /> ¿Por qué?
      </button>

      {(estado === 'loading' || estado === 'vacio') && (
        <div role="status" aria-live="polite" className="c-subtitle" style={{ marginTop: 'var(--s2)' }}>
          {estado === 'loading' ? 'Un momento…' : 'No tengo más detalle de esto por ahora.'}
        </div>
      )}

      {estado === 'open' && data && (
        <div id={panelId} style={{ marginTop: 'var(--s2)', padding: 'var(--s3)', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          {data.titulo && <div className="c-title" style={{ fontSize: 15, marginBottom: 4 }}>{data.titulo}</div>}
          <div className="c-body" style={{ color: 'var(--text)' }}>{data.texto}</div>
          {data.derivar && (
            <div className="c-subtitle" style={{ marginTop: 6, color: 'var(--text-3)' }}>Consulta tu caso con un profesional de salud.</div>
          )}
        </div>
      )}
    </div>
  );
}
