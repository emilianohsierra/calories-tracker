'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import RepasoCard from '@/components/coach/RepasoCard';
import { getEducacionUI, postOferta } from '@/lib/coach/eduClient';

// Oferta LIGERA de repaso en el coach (Drucker §1): sólo si hay un tema due (`repaso`) Y el backend
// dice `ofrecer` (back-off vivo). 1 tap sí/no; posponer NUNCA marca fallo/culpa (registra oferta
// rechazada para el back-off, con tono neutro). Deploy-safe: sin repaso/ofrecer → no renderiza nada.
export default function RepasoOferta() {
  const [repaso, setRepaso] = useState(null);
  const [ofrecer, setOfrecer] = useState(false);
  const [estado, setEstado] = useState('oferta'); // oferta | abierto | oculto

  useEffect(() => {
    let vivo = true;
    getEducacionUI().then((d) => {
      if (!vivo || !d) return;
      setRepaso(d.repaso || null);
      setOfrecer(!!d.ofrecer);
    });
    return () => { vivo = false; };
  }, []);

  if (!repaso || !ofrecer || estado === 'oculto') return null;

  const posponer = () => { postOferta(false).catch(() => {}); setEstado('oculto'); }; // back-off, sin culpa
  const aceptar = () => { postOferta(true).catch(() => {}); setEstado('abierto'); };

  if (estado === 'abierto') {
    return <RepasoCard repaso={repaso} onClose={() => setEstado('oculto')} />;
  }

  return (
    <div style={{ margin: '0 var(--s4) var(--s2)', display: 'flex', alignItems: 'center', gap: 'var(--s3)', padding: 'var(--s3)', borderRadius: 'var(--r-md)', background: 'var(--brand-tint)', border: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--brand-strong)', flexShrink: 0 }}><Icon name="book" size={18} /></span>
      <span className="c-subtitle" style={{ flex: 1, color: 'var(--text)' }}>¿Reforzamos por qué esto importa? (1 min)</span>
      <button type="button" className="btn btn-primary" onClick={aceptar} style={{ minHeight: 'var(--touch)', padding: '6px 14px' }}>Sí</button>
      <button type="button" className="link-btn" onClick={posponer} aria-label="Ahora no" style={{ minHeight: 'var(--touch)' }}>Ahora no</button>
    </div>
  );
}
