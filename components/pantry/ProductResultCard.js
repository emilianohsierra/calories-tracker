'use client';

import Icon from '@/components/ui/Icon';
import ConfidenceBadge from '@/components/pantry/ConfidenceBadge';
import ProductNomInfo from '@/components/pantry/ProductNomInfo';
import Sustituciones from '@/components/pantry/Sustituciones';
import { NUTRICION_FIELDS, imageOf } from '@/lib/pantry/constants';
import { isNutritionIncomplete } from '@/lib/pantry/productSearch';

// Tarjeta de resultado de producto (Producto-DB).
// variant='full'  → match auto: foto + marca + nombre + presentación + nutrición COMPLETA
//                    + [Agregar a mi despensa] / [Editar información] (o completar si falta info).
// variant='compact' → candidato de disambiguation: card clicable (foto+nombre+marca+presentación).
export default function ProductResultCard({ product, variant = 'full', onAdd, onEdit, onComplete, onSelect }) {
  const img = imageOf(product);
  const n = product.nutricion || {};
  const incompleta = isNutritionIncomplete(n);
  const porcion = n.porcion;

  const Photo = ({ size }) => (
    <div style={{ width: size, height: size, flexShrink: 0, borderRadius: 'var(--r-md)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', color: 'var(--text-3)' }}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={product.nombre} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : <Icon name="box" size={Math.round(size / 2.4)} />}
    </div>
  );

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={() => onSelect?.(product)}
        aria-label={`${product.nombre}${product.marca ? `, ${product.marca}` : ''}${product.presentacion ? `, ${product.presentacion}` : ''}`}
        style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 'var(--s3)', padding: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface)', cursor: 'pointer' }}
      >
        <Photo size={48} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.nombre}</span>
          <span className="c-subtitle" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[product.marca, product.presentacion].filter(Boolean).join(' · ')}
          </span>
        </span>
        <ConfidenceBadge level={product.is_user_created ? 'user' : product.confianza} compact />
      </button>
    );
  }

  return (
    <div className="c-card" style={{ gap: 'var(--s3)' }}>
      <div style={{ display: 'flex', gap: 'var(--s4)' }}>
        <Photo size={96} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {product.marca && <span className="c-subtitle">{product.marca}</span>}
          <span className="c-title">{product.nombre}</span>
          {product.presentacion && <span className="c-subtitle">{product.presentacion}</span>}
          <span style={{ marginTop: 4 }}><ConfidenceBadge level={product.is_user_created ? 'user' : product.confianza} compact /></span>
        </div>
      </div>

      {!incompleta ? (
        <div>
          <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>
            Nutrición {porcion ? `por porción (${Math.round(porcion)} g)` : 'por 100 g/ml'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s2) var(--s4)' }}>
            {NUTRICION_FIELDS.filter((f) => n[f.key] != null).map((f) => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s2)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)' }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: f.color }} />{f.label}
                </span>
                <span className="num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{Math.round(n[f.key])} {f.unit}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)', padding: 'var(--s3)', borderRadius: 'var(--r-md)', background: 'var(--warn-tint)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--warn-c)' }}>
            <Icon name="info" size={15} /> Información nutricional incompleta
          </span>
          <span className="c-subtitle" style={{ margin: 0 }}>No inventamos valores. Complétala para registrarla bien.</span>
        </div>
      )}

      {/* Fase 5: sellos NOM-051 + ingredientes + aditivos (renderiza null si no hay datos). */}
      <ProductNomInfo product={product} />

      {/* Batch 2 #3: alternativas mejores y seguras (del backend; degrada si no hay endpoint). */}
      {product.product_id && <Sustituciones productId={product.product_id} />}

      <div className="c-card__actions" style={{ flexWrap: 'wrap' }}>
        {incompleta ? (
          <>
            <button type="button" className="btn btn-primary" onClick={() => onComplete?.('foto')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="camera" size={16} /> Completar con etiqueta
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onComplete?.('manual')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="pencil" size={16} /> Completar a mano
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={() => onAdd?.(product)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="plus" size={16} /> Agregar a mi despensa
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onEdit?.(product)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="pencil" size={16} /> Editar información
            </button>
          </>
        )}
      </div>
    </div>
  );
}
