'use client';

import Icon from '@/components/ui/Icon';

// Experiencia de "no encontrado" (miss). NADA de 404: tono cálido + salidas claras.
export default function ProductMiss({ onEtiqueta, onManual }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)', alignItems: 'stretch', textAlign: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s2)', padding: 'var(--s5) var(--s4)' }}>
        <span style={{ color: 'var(--text-3)' }}><Icon name="search" size={28} /></span>
        <p className="c-body" style={{ margin: 0, color: 'var(--text)' }}>No encontramos este producto.</p>
        <p className="c-subtitle" style={{ margin: 0 }}>Puedes fotografiar la etiqueta y lo agregamos.</p>
      </div>
      <button type="button" className="btn btn-primary" onClick={onEtiqueta} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="camera" size={18} /> Fotografiar etiqueta
      </button>
      <button type="button" className="btn btn-ghost" onClick={onManual} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="pencil" size={16} /> Agregar manual
      </button>
    </div>
  );
}
