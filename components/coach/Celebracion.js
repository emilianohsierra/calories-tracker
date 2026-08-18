'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';

// Celebración LIGERA (§15): toast breve al subir de nivel / cerrar racha-hito / desbloquear logro.
// Sin confeti ni interrupción. Es un toast estático (aparece/desaparece) → inherentemente seguro con
// prefers-reduced-motion. Se muestra una sola vez por celebración (guard en localStorage).
const ICONO = { nivel: 'trending', racha: 'flame', logro: 'star' };

export default function Celebracion({ celebracion }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!celebracion?.texto) return undefined;
    const id = celebracion.id || `${celebracion.tipo}:${celebracion.texto}`;
    try {
      if (localStorage.getItem(`celeb_${id}`)) return undefined;
      localStorage.setItem(`celeb_${id}`, '1');
    } catch { /* sin persistencia: se mostrará esta sesión */ }
    setShow(true);
    const t = setTimeout(() => setShow(false), 3400);
    return () => clearTimeout(t);
  }, [celebracion]);

  if (!show) return null;
  return (
    <div role="status" aria-live="polite"
      style={{ position: 'fixed', left: '50%', bottom: 88, transform: 'translateX(-50%)', zIndex: 60, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 'var(--r-pill)', background: 'var(--brand)', color: 'var(--brand-ink)', boxShadow: 'var(--shadow-2)', maxWidth: 'calc(100% - 32px)' }}>
      <Icon name={ICONO[celebracion.tipo] || 'sparkles'} size={16} />
      <span style={{ fontWeight: 600 }}>{celebracion.texto}</span>
    </div>
  );
}
