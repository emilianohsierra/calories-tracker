'use client';

import { useEffect, useState } from 'react';

// Coach · Proactividad Fase 1 — bandeja in-app MÍNIMA (funcional para probar E2E).
// Rams pulirá el badge/bandeja; esto solo lista las notificaciones NO vistas y permite marcarlas.
// Deploy-safe: si la tabla no existe o falla el fetch, no renderiza nada.
export default function CoachNotifications() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let vivo = true;
    fetch('/api/coach/notifications?unseen=1')
      .then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((d) => { if (vivo) setItems(Array.isArray(d.notifications) ? d.notifications : []); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const marcarVisto = async (id) => {
    setItems((xs) => xs.filter((n) => n.id !== id)); // optimista
    try {
      await fetch(`/api/coach/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visto: true }),
      });
    } catch { /* si falla, reaparecerá al recargar */ }
  };

  if (!items.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)', padding: 'var(--s3)' }} aria-label="Novedades de tu coach">
      {items.map((n) => (
        <div
          key={n.id}
          role="status"
          style={{
            border: `1px solid ${n.prioridad >= 2 ? 'var(--brand)' : 'var(--border)'}`,
            borderRadius: 'var(--r-md)', background: 'var(--surface-2)', padding: 'var(--s3)',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}
        >
          <strong style={{ fontSize: 14 }}>{n.titulo}</strong>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{n.cuerpo}</span>
          <button
            type="button"
            className="link-btn"
            onClick={() => marcarVisto(n.id)}
            style={{ alignSelf: 'flex-end', minHeight: 'var(--touch)' }}
          >
            Entendido
          </button>
        </div>
      ))}
    </div>
  );
}
