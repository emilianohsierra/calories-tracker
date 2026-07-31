'use client';

import { useEffect, useRef } from 'react';

// Composer premium (Rams §5): textarea auto-crece 1→5 líneas, botón ＋ (adjuntar foto →
// analizar) y enviar circular. Voz = Fase 2 (sin micrófono en Fase 1).
// Enter envía, Shift+Enter salto de línea.
export default function Composer({ value, onChange, onSend, onAttach, busy }) {
  const taRef = useRef(null);

  // Auto-crecer: reajusta la altura al contenido (máx via CSS max-height).
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [value]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="coach-composer">
      <button type="button" className="composer-icon" aria-label="Adjuntar foto" onClick={onAttach} disabled={busy}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <textarea
        ref={taRef}
        rows={1}
        value={value}
        placeholder="Escribe a tu coach…"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={busy}
      />
      <button type="button" className="composer-send" aria-label="Enviar" onClick={onSend} disabled={busy || !value.trim()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
}
