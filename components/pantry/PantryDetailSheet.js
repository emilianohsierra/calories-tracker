'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import QtyStepper from '@/components/pantry/QtyStepper';
import ConfidenceBadge from '@/components/pantry/ConfidenceBadge';
import ExpiryPill from '@/components/pantry/ExpiryPill';
import ConfirmProduct from '@/components/pantry/ConfirmProduct';
import { NUTRICION_FIELDS, imageOf } from '@/lib/pantry/constants';

// Detalle de un producto: editar cantidad (+Agregar/−Consumir), caducidad, editar y eliminar.
export default function PantryDetailSheet({ item, onClose, onUpdate, onDelete }) {
  const [qty, setQty] = useState(item.cantidad);
  const [caduca, setCaduca] = useState(item.caduca_el || '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, busy]);

  const commitQty = (v) => {
    setQty(v);
    onUpdate(item.id, { cantidad: v });
  };
  const commitCaduca = (v) => {
    setCaduca(v);
    onUpdate(item.id, { caduca_el: v || null });
  };

  const remove = async () => {
    setBusy(true);
    await onDelete(item.id);
    onClose();
  };

  const n = item.nutricion || {};
  const img = imageOf(item);
  const porcion = n.porcion;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Detalle de ${item.nombre}`} style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s3)', marginBottom: 'var(--s3)' }}>
          <div style={{ width: 64, height: 64, borderRadius: 'var(--r-md)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-3)', overflow: 'hidden' }}>
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={item.nombre} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'var(--r-md)' }} />
            ) : <Icon name="utensils" size={24} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>{item.nombre}</h2>
            {item.marca && <p className="c-subtitle" style={{ margin: '2px 0 0' }}>{item.marca}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar" style={{ display: 'inline-flex', width: 'var(--touch)', height: 'var(--touch)', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', margin: '-8px -8px 0 0' }}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {editing ? (
          <ConfirmProduct
            draft={{ ...item, cantidad: qty }}
            onCancel={() => setEditing(false)}
            onSave={(patch) => { onUpdate(item.id, patch); setEditing(false); }}
          />
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
              <div>
                <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>Disponible</p>
                <QtyStepper value={qty} unit={item.unidad} onChange={commitQty} label="Cantidad disponible" />
              </div>

              <div style={{ display: 'flex', gap: 'var(--s3)' }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => commitQty(Math.max(0, qty - 1))}>
                  <Icon name="minus" size={16} /> Consumir
                </button>
                <button type="button" className="btn btn-primary" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => commitQty(qty + 1)}>
                  <Icon name="plus" size={16} /> Agregar
                </button>
              </div>
              {qty === 0 && (
                <p className="c-subtitle" style={{ margin: 0, color: 'var(--warn-c)' }}>Se acabó. Puedes dejarlo en 0 para recomprarlo o eliminarlo.</p>
              )}

              <div className="field">
                <label htmlFor="detail-cad">Caducidad</label>
                <input id="detail-cad" type="date" value={caduca} onChange={(e) => commitCaduca(e.target.value)} />
                <span style={{ marginTop: 6 }}><ExpiryPill date={caduca} showFar /></span>
              </div>

              <div>
                <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>
                  Nutrición {porcion ? `por porción (${Math.round(porcion)} g)` : 'por 100 g/ml'}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s2) var(--s4)' }}>
                  {NUTRICION_FIELDS.filter((f) => n[f.key] != null).map((f) => (
                    <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s2)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)' }}>
                        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: f.color }} />
                        {f.label}
                      </span>
                      <span className="num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {Math.round(n[f.key])} {f.unit}
                      </span>
                    </div>
                  ))}
                </div>
                {Object.keys(n).every((k) => n[k] == null) && (
                  <p className="c-subtitle" style={{ margin: 0, color: 'var(--text-3)' }}>Sin datos de nutrición.</p>
                )}
              </div>

              <div><ConfidenceBadge level={item.confianza} /></div>
            </div>

            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)} disabled={busy}>
                <Icon name="pencil" size={16} /> Editar
              </button>
              <button type="button" className="btn btn-ghost" onClick={remove} disabled={busy} style={{ color: 'var(--over)' }}>
                <Icon name="trash" size={16} /> Eliminar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
