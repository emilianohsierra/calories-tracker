'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { getSustituciones } from '@/lib/pantry/sustitucionesClient';

// Sección "Alternativas mejores y seguras" en la ficha del producto (Batch 2 #3). Consume el
// endpoint de sustituciones del CTO (que ya filtra alérgenos). La UI NO inventa: nombre/razón/
// nutri-score/sellos/disponibilidad vienen del backend. Estados: loading, vacío honesto, y degrade
// (si el endpoint falla → no renderiza nada, la ficha no se rompe). Consistente con el coach.
const NUTRI_COLOR = { a: 'var(--ok)', b: 'var(--fiber)', c: 'var(--warn-c)', d: 'var(--carbs)', e: 'var(--over)' };

function NutriBadge({ score }) {
  const s = String(score || '').toLowerCase();
  if (!NUTRI_COLOR[s]) return null;
  return (
    <span role="img" aria-label={`Nutri-Score ${s.toUpperCase()}`} title={`Nutri-Score ${s.toUpperCase()}`}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 'var(--r-sm)', background: NUTRI_COLOR[s], color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
      {s.toUpperCase()}
    </span>
  );
}

export default function Sustituciones({ productId }) {
  const [data, setData] = useState(undefined); // undefined=cargando · null=degrade · objeto=listo

  useEffect(() => {
    let vivo = true;
    getSustituciones(productId).then((d) => { if (vivo) setData(d); });
    return () => { vivo = false; };
  }, [productId]);

  if (data === null) return null; // endpoint falló → no romper la ficha (degrade)

  const lista = Array.isArray(data?.sustituciones) ? data.sustituciones : [];

  return (
    <section aria-label="Alternativas mejores y seguras" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--s3)' }}>
      <p className="c-subtitle" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 0 var(--s2)' }}>
        <Icon name="sparkles" size={14} /> Alternativas mejores y seguras
      </p>

      {data === undefined ? (
        <div aria-busy="true" aria-label="Buscando alternativas" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
          {[0, 1].map((i) => <div key={i} style={{ height: 44, borderRadius: 'var(--r-md)', background: 'var(--surface-2)', opacity: 0.7 }} />)}
        </div>
      ) : lista.length === 0 ? (
        <p className="c-subtitle" style={{ margin: 0, color: 'var(--text-2)' }}>
          {data?.nota || 'No encontramos una mejor opción segura para este producto por ahora.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
          {lista.map((alt, i) => (
            <div key={alt.product_id || i} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 'var(--s3)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
                <NutriBadge score={alt.nutri_score} />
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{alt.nombre}</span>
                {alt.disponible && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 11, fontWeight: 600, color: 'var(--brand-strong)', background: 'var(--brand-tint)', borderRadius: 'var(--r-pill)', padding: '2px 8px' }}>
                    <Icon name="box" size={12} /> En tu despensa
                  </span>
                )}
              </div>
              {alt.razon && <span className="c-subtitle" style={{ color: 'var(--text-2)' }}>{alt.razon}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
