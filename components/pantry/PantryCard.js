'use client';

import Icon from '@/components/ui/Icon';
import ConfidenceBadge from '@/components/pantry/ConfidenceBadge';
import ExpiryPill from '@/components/pantry/ExpiryPill';

// Card de producto (no fila de tabla): imagen + nombre + marca + cantidad + badge de
// confianza + nutrición básica + caducidad. Tap → detalle.
export default function PantryCard({ item, onOpen }) {
  const { nombre, marca, cantidad, unidad, nutricion, confianza, caduca_el, imagen } = item;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      aria-label={`${nombre}${marca ? `, ${marca}` : ''}, ${cantidad} ${unidad}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'left',
        padding: 0,
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        background: 'var(--surface)',
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: 'var(--shadow-1)',
      }}
    >
      {/* Imagen / placeholder + badge de confianza sobrepuesto */}
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagen} alt={nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span aria-hidden="true" style={{ color: 'var(--text-3)' }}>
            <Icon name="utensils" size={30} />
          </span>
        )}
        <span style={{ position: 'absolute', top: 6, left: 6 }}>
          <ConfidenceBadge level={confianza} compact />
        </span>
      </div>

      <div style={{ padding: 'var(--s3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="c-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombre}</span>
        {marca && <span className="c-subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{marca}</span>}
        <span className="num" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
          {cantidad} {unidad}
        </span>
        {nutricion?.kcal != null && (
          <span className="num" style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {Math.round(nutricion.kcal)} kcal · P{Math.round(nutricion.prot || 0)} C{Math.round(nutricion.carb || 0)} G{Math.round(nutricion.gras || 0)}
            <span style={{ color: 'var(--text-3)' }}> /100</span>
          </span>
        )}
        <span style={{ marginTop: 2 }}><ExpiryPill date={caduca_el} /></span>
      </div>
    </button>
  );
}
