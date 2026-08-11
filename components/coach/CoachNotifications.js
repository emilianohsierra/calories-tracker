'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import PushToggle from '@/components/coach/PushToggle';
import NotificationSettings from '@/components/coach/NotificationSettings';
import { notifMeta, haceTiempo } from '@/lib/coach/notifTypes';

// Coach · Proactividad — bandeja pulida. Campana con badge de no-vistas → panel (hoja) con la
// lista (prioridad ALTA resaltada, icono por tipo, estados carga/vacío, "Entendido" por item +
// "Marcar todo") + botón "Activar avisos" + acceso a Ajustes. Deploy-safe: si el fetch falla,
// la campana muestra 0 y el panel enseña el estado vacío.
export default function CoachNotifications() {
  const [items, setItems] = useState([]);
  const [unseen, setUnseen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const cargar = () => {
    setLoading(true);
    fetch('/api/coach/notifications')
      .then((r) => (r.ok ? r.json() : { notifications: [], unseen: 0 }))
      .then((d) => {
        setItems(Array.isArray(d.notifications) ? d.notifications : []);
        setUnseen(Number(d.unseen) || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const marcarVisto = async (id) => {
    setItems((xs) => xs.map((n) => (n.id === id ? { ...n, visto: true } : n)));
    setUnseen((u) => Math.max(0, u - 1));
    try {
      await fetch(`/api/coach/notifications/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visto: true }),
      });
    } catch { /* reaparece al recargar */ }
  };

  const marcarTodo = async () => {
    const pend = items.filter((n) => !n.visto);
    setItems((xs) => xs.map((n) => ({ ...n, visto: true })));
    setUnseen(0);
    await Promise.allSettled(pend.map((n) => fetch(`/api/coach/notifications/${n.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visto: true }),
    })));
  };

  return (
    <>
      <button
        type="button"
        className="link-btn"
        onClick={() => { setOpen(true); cargar(); }}
        aria-label={unseen > 0 ? `Novedades, ${unseen} sin ver` : 'Novedades'}
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 'var(--touch)', minHeight: 'var(--touch)', color: 'var(--text-2)' }}
      >
        <Icon name="bell" size={20} />
        {unseen > 0 && (
          <span aria-hidden="true" className="num" style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 'var(--r-pill)', background: 'var(--brand)', color: 'var(--brand-ink)', fontSize: 10, fontWeight: 700, lineHeight: '16px', textAlign: 'center' }}>
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </button>

      {open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Novedades de tu coach" style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s2)', marginBottom: 'var(--s3)' }}>
              <h2 style={{ margin: 0, fontSize: 18, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name="bell" size={18} /> Novedades
              </h2>
              <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Ajustes de avisos" style={{ display: 'inline-flex', width: 'var(--touch)', height: 'var(--touch)', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--text-2)', cursor: 'pointer' }}>
                  <Icon name="settings" size={18} />
                </button>
                <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" style={{ display: 'inline-flex', width: 'var(--touch)', height: 'var(--touch)', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', margin: '0 -8px 0 0' }}>
                  <Icon name="close" size={20} />
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 'var(--s4)' }}><PushToggle /></div>

            {items.some((n) => !n.visto) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--s2)' }}>
                <button type="button" className="link-btn" onClick={marcarTodo}>Marcar todo como visto</button>
              </div>
            )}

            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }} aria-busy="true" aria-label="Cargando novedades">
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ height: 64, borderRadius: 'var(--r-md)', background: 'var(--surface-2)', opacity: 0.7 }} />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--s6) var(--s4)' }}>
                <div style={{ color: 'var(--text-3)', marginBottom: 'var(--s2)' }}><Icon name="bell" size={26} /></div>
                Sin novedades por ahora.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
                {items.map((n) => {
                  const meta = notifMeta(n.event_type);
                  const alta = n.prioridad >= 2;
                  return (
                    <div
                      key={n.id}
                      role="status"
                      style={{
                        display: 'flex', gap: 'var(--s3)', padding: 'var(--s3)', borderRadius: 'var(--r-md)',
                        border: `1px solid ${alta ? 'var(--brand)' : 'var(--border)'}`,
                        background: alta ? 'var(--brand-tint)' : 'var(--surface-2)',
                        opacity: n.visto ? 0.6 : 1,
                      }}
                    >
                      <span style={{ flexShrink: 0, color: alta ? 'var(--brand-strong)' : 'var(--text-2)', marginTop: 2 }}>
                        <Icon name={meta.icon} size={18} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--s2)' }}>
                          <strong style={{ fontSize: 14, fontWeight: n.visto ? 500 : 700, color: 'var(--text)' }}>{n.titulo}</strong>
                          <span className="ring-caption" style={{ flexShrink: 0 }}>{haceTiempo(n.created_at)}</span>
                        </div>
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{n.cuerpo}</span>
                        {!n.visto && (
                          <button type="button" className="link-btn" onClick={() => marcarVisto(n.id)} style={{ alignSelf: 'flex-end', minHeight: 'var(--touch)' }}>
                            Entendido
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {settingsOpen && <NotificationSettings onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
