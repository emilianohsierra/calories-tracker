'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import QtyStepper from '@/components/pantry/QtyStepper';
import ConfidenceBadge from '@/components/pantry/ConfidenceBadge';
import ExpiryPill from '@/components/pantry/ExpiryPill';
import ConfirmProduct from '@/components/pantry/ConfirmProduct';

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

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Detalle de ${item.nombre}`} style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s3)', marginBottom: 'var(--s3)' }}>
          <div style={{ width: 56, height: 56, borderRadius: 'var(--r-md)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-3)' }}>
            {item.imagen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imagen} alt={item.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--r-md)' }} />
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

              {n.kcal != null && (
                <p className="num" style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
                  {Math.round(n.kcal)} kcal · P{Math.round(n.prot || 0)} · C{Math.round(n.carb || 0)} · G{Math.round(n.gras || 0)} <span style={{ color: 'var(--text-3)' }}>/100</span>
                </p>
              )}

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
