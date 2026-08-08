'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ConfirmProduct from '@/components/pantry/ConfirmProduct';
import ScanView from '@/components/pantry/ScanView';
import LabelCapture from '@/components/pantry/LabelCapture';
import ProductSearchStep from '@/components/pantry/ProductSearchStep';

const METHODS = [
  { id: 'manual', icon: 'pencil', label: 'Manual', ready: true },
  { id: 'search', icon: 'search', label: 'Buscar', ready: true },
  { id: 'scan', icon: 'barcode', label: 'Escanear', ready: true },
  { id: 'photo', icon: 'camera', label: 'Foto de etiqueta', ready: true },
];

const TITLES = { method: 'Agregar a tu despensa', search: 'Buscar producto', scan: 'Escanear código', photo: 'Foto de etiqueta', confirm: 'Confirma el producto' };

// Bottom-sheet para agregar producto. Flujo: método → (manual | buscar | escanear | foto) → Confirmar.
export default function AddProductSheet({ onClose, onAdd, onPaywall, startManual = false }) {
  // startManual (N-I7): entrar directo al form manual (p.ej. desde "Seguir con registro manual" del paywall).
  const [step, setStep] = useState(startManual ? 'confirm' : 'method'); // method | search | scan | photo | confirm
  const [draft, setDraft] = useState(startManual ? { confianza: 'user' } : null);
  const [carry, setCarry] = useState(null); // N-I5: producto conocido (nombre/marca) al cambiar de método
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
    } else if (id === 'scan') {
      setStep('scan');
    } else if (id === 'photo') {
      setStep('photo');
    }
  };

  // Cambiar de método conservando lo ya conocido (N-I5): al ir a foto/scan desde un resultado con
  // nombre/marca (nutrición incompleta), se preserva para no re-teclear.
  const goMethod = (m, keep) => { if (keep) setCarry(keep); setStep(m); };

  // Buscar/Escanear/Foto entregan un draft precargado → Confirmar (campos editables). Si había un
  // producto conocido (carry), se FUSIONA: el nuevo dato manda, pero nombre/marca/categoría/código
  // conocidos rellenan lo que el método nuevo no trae (p.ej. la etiqueta da nutrición, no el nombre).
  const onPrefill = (d) => {
    const merged = carry
      ? { ...carry, ...d, nombre: d.nombre || carry.nombre, marca: d.marca || carry.marca, categoria: d.categoria || carry.categoria, codigo: d.codigo || carry.codigo }
      : d;
    setCarry(null);
    setDraft(merged);
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

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Agregar producto a tu despensa" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s3)' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{TITLES[step] || 'Agregar a tu despensa'}</h2>
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
          <ProductSearchStep onPick={onPrefill} onUseMethod={goMethod} onBack={() => setStep('method')} />
        )}

        {step === 'scan' && (
          <ScanView onDetected={onPrefill} onFallback={() => setStep('method')} onUseMethod={goMethod} />
        )}

        {step === 'photo' && (
          <LabelCapture onExtracted={onPrefill} onPaywall={(pw) => { onClose(); onPaywall?.(pw); }} onFallback={() => setStep('method')} />
        )}

        {step === 'confirm' && (
          <ConfirmProduct draft={draft} saving={saving} onCancel={() => setStep('method')} onSave={save} />
        )}
      </div>
    </div>
  );
}
