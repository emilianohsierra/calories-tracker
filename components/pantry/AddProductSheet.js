'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ConfirmProduct from '@/components/pantry/ConfirmProduct';

// Mini-catálogo demo para la vía "Buscar" (V1 sin backend). Cuando exista el catálogo
// nutricional del CTO, esta lista viene del endpoint. Match = confianza "verified".
const CATALOG = [
  { nombre: 'Huevo', marca: 'San Juan', categoria: 'proteinas', unidad: 'pza', nutricion: { kcal: 143, prot: 13, carb: 1.1, gras: 9.5 } },
  { nombre: 'Arroz blanco', marca: 'Verde Valle', categoria: 'carbos', unidad: 'g', nutricion: { kcal: 130, prot: 2.7, carb: 28, gras: 0.3 } },
  { nombre: 'Frijol negro', marca: 'La Sierra', categoria: 'proteinas', unidad: 'g', nutricion: { kcal: 91, prot: 6, carb: 16, gras: 0.5 } },
  { nombre: 'Leche descremada', marca: 'Lala', categoria: 'lacteos', unidad: 'ml', nutricion: { kcal: 35, prot: 3.4, carb: 5, gras: 0.1 } },
  { nombre: 'Atún en agua', marca: 'Dolores', categoria: 'proteinas', unidad: 'g', nutricion: { kcal: 116, prot: 26, carb: 0, gras: 1 } },
];

const METHODS = [
  { id: 'manual', icon: 'pencil', label: 'Manual', ready: true },
  { id: 'search', icon: 'search', label: 'Buscar', ready: true },
  { id: 'scan', icon: 'barcode', label: 'Escanear', ready: false },
  { id: 'photo', icon: 'camera', label: 'Foto de etiqueta', ready: false },
];

// Bottom-sheet para agregar producto. Flujo: método → (manual | buscar) → Confirmar.
// Escanear/Foto llegan en rebanada posterior (marcados "Pronto").
export default function AddProductSheet({ onClose, onAdd }) {
  const [step, setStep] = useState('method'); // method | search | confirm
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && !saving && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, saving]);

  const pickMethod = (id) => {
    if (id === 'manual') {
      setDraft({ confianza: 'user' });
      setStep('confirm');
    } else if (id === 'search') {
      setStep('search');
    }
  };

  const pickResult = (r) => {
    setDraft({ ...r, cantidad: '', confianza: 'verified' });
    setStep('confirm');
  };

  const save = async (item) => {
    setSaving(true);
    try {
      await onAdd(item);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const results = query.trim()
    ? CATALOG.filter((c) => `${c.nombre} ${c.marca}`.toLowerCase().includes(query.trim().toLowerCase()))
    : CATALOG;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Agregar producto a tu despensa" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s3)' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            {step === 'method' ? 'Agregar a tu despensa' : step === 'search' ? 'Buscar producto' : 'Confirma el producto'}
          </h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar" style={{ display: 'inline-flex', width: 'var(--touch)', height: 'var(--touch)', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', margin: '-8px -8px 0 0' }}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {step === 'method' && (
          <>
            <p className="c-subtitle" style={{ margin: '0 0 var(--s3)' }}>¿Cómo lo agregamos?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s3)' }}>
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => m.ready && pickMethod(m.id)}
                  disabled={!m.ready}
                  aria-label={m.ready ? m.label : `${m.label} (próximamente)`}
                  style={{
                    position: 'relative',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    padding: 'var(--s4)', minHeight: 88,
                    border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                    background: m.ready ? 'var(--surface-2)' : 'var(--surface)',
                    color: m.ready ? 'var(--text)' : 'var(--text-3)',
                    cursor: m.ready ? 'pointer' : 'default', opacity: m.ready ? 1 : 0.7,
                  }}
                >
                  <span style={{ color: m.ready ? 'var(--brand-strong)' : 'var(--text-3)' }}><Icon name={m.icon} size={24} /></span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</span>
                  {!m.ready && (
                    <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', padding: '1px 6px' }}>Pronto</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'search' && (
          <>
            <div role="search" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', padding: '0 var(--s4)', minHeight: 'var(--touch)', borderRadius: 'var(--r-pill)', background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 'var(--s3)' }}>
              <span aria-hidden="true" style={{ color: 'var(--text-3)', display: 'inline-flex' }}><Icon name="search" size={18} /></span>
              <input type="text" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre o marca…" aria-label="Buscar en el catálogo" style={{ flex: 1, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 15, outline: 'none', minWidth: 0 }} />
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
              {results.map((r) => (
                <li key={`${r.nombre}-${r.marca}`}>
                  <button type="button" onClick={() => pickResult(r)} style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--s2)', padding: 'var(--s3)', minHeight: 'var(--touch)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                    <span>
                      <span style={{ fontWeight: 600 }}>{r.nombre}</span>
                      {r.marca && <span className="c-subtitle"> · {r.marca}</span>}
                    </span>
                    <span className="num" style={{ color: 'var(--text-2)', fontSize: 13 }}>{r.nutricion.kcal} kcal</span>
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="c-subtitle" style={{ padding: 'var(--s3)' }}>
                  No está en el catálogo. <button type="button" className="link-btn" onClick={() => { setDraft({ nombre: query, confianza: 'user' }); setStep('confirm'); }}>Agrégalo manual</button>
                </li>
              )}
            </ul>
            <div style={{ marginTop: 'var(--s3)' }}>
              <button type="button" className="link-btn" onClick={() => setStep('method')}>‹ Otro método</button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <ConfirmProduct draft={draft} saving={saving} onCancel={() => setStep('method')} onSave={save} />
        )}
      </div>
    </div>
  );
}
