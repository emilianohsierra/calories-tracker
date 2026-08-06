'use client';

// Info regulatoria del producto (Fase 5): sellos NOM-051 (solo los de EXCESO computados),
// ingredientes y aditivos (código E + nombre, SIN nivel de riesgo — no existe fuente libre).
// Reproduce el etiquetado oficial; NO es consejo médico. Renderiza null si no hay nada que mostrar.
// NADA de invención: sellos indeterminados NO se muestran; aditivos sin semáforo.

const SELLO_LABEL = {
  calorias: 'EXCESO CALORÍAS',
  azucares: 'EXCESO AZÚCARES',
  grasas_saturadas: 'EXCESO GRASAS SATURADAS',
  grasas_trans: 'EXCESO GRASAS TRANS',
  sodio: 'EXCESO SODIO',
};

export default function ProductNomInfo({ product }) {
  const sellos = product?.sellos || {};
  const activos = Array.isArray(sellos.activos) ? sellos.activos : [];
  const ingredientes = Array.isArray(product?.ingredientes) ? product.ingredientes : [];
  const aditivos = Array.isArray(product?.aditivos) ? product.aditivos : [];

  if (!activos.length && !ingredientes.length && !aditivos.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)', borderTop: '1px solid var(--border)', paddingTop: 'var(--s3)' }}>
      {activos.length > 0 && (
        <div>
          <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>Sellos de advertencia (NOM-051)</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s2)' }}>
            {activos.map((k) => (
              <span
                key={k}
                role="img"
                aria-label={SELLO_LABEL[k]}
                style={{ display: 'inline-flex', alignItems: 'center', textAlign: 'center', lineHeight: 1.05, padding: '6px 8px', minWidth: 64, borderRadius: 8, background: '#000', color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: 0.2, border: '2px solid #000' }}
              >
                {SELLO_LABEL[k]}
              </span>
            ))}
          </div>
          <p className="c-subtitle" style={{ margin: 'var(--s2) 0 0', fontSize: 11 }}>
            Reproduce el etiquetado frontal oficial (NOM-051). No es consejo médico.
          </p>
        </div>
      )}

      {ingredientes.length > 0 && (
        <div>
          <p className="c-subtitle" style={{ margin: '0 0 2px' }}>Ingredientes</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>{ingredientes.join(', ')}</p>
        </div>
      )}

      {aditivos.length > 0 && (
        <div>
          <p className="c-subtitle" style={{ margin: '0 0 2px' }}>Aditivos</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {aditivos.map((a) => (
              <span key={a.additive_code} style={{ fontSize: 12, color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', padding: '2px 8px' }}>
                {a.additive_code}{a.name ? ` · ${a.name}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
