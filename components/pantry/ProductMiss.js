'use client';

import Icon from '@/components/ui/Icon';

// Experiencia de "no encontrado" (miss). NADA de 404: tono cálido + salidas claras. Si hay un
// `nombre` escrito, el CTA "Agregar el tuyo" lo PRECARGA (sin volver a teclear).
export default function ProductMiss({ onEtiqueta, onManual, nombre }) {
  const nom = String(nombre || '').trim();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)', alignItems: 'stretch', textAlign: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s2)', padding: 'var(--s5) var(--s4)' }}>
        <span style={{ color: 'var(--text-3)' }}><Icon name="search" size={28} /></span>
        <p className="c-body" style={{ margin: 0, color: 'var(--text)' }}>No encontramos este producto{nom ? ' en el catálogo' : ''}.</p>
        <p className="c-subtitle" style={{ margin: 0 }}>Fotografía la etiqueta o créalo tú — se guarda como <strong>Tuyo</strong>.</p>
      </div>
      <button type="button" className="btn btn-primary" onClick={onEtiqueta} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="camera" size={18} /> Fotografiar etiqueta
      </button>
      <button type="button" className="btn btn-ghost" onClick={onManual} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="pencil" size={16} /> {nom ? `Agregar "${nom}" a mano` : 'Agregar manual'}
      </button>
    </div>
  );
}
