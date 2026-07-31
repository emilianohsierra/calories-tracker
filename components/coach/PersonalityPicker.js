'use client';

import { useEffect, useRef, useState } from 'react';

// Selector de personalidad (Rams §7): bajo un botón en cabecera (no barra fija), con
// PREVIEW EN VIVO por tono. Cambia el tono (gratis), no la ciencia. Persiste en /api/coach/settings.
const TONES = [
  { id: 'amigable', label: 'Amigable', preview: '¡Casi lo tienes! Unos huevos con la cena y cierras el día.' },
  { id: 'entrenador', label: 'Entrenador', preview: 'Te faltan 25 g y no los dejas hoy. Pechuga o huevos —se cierran.' },
  { id: 'analitico', label: 'Analítico', preview: 'Proteína 115/140 g (82%). +25 g = 130 g de pechuga → 100%.' },
  { id: 'tranquilo', label: 'Tranquilo', preview: 'Vas bien. Si te apetece, 25 g más redondean el día.' },
];

export default function PersonalityPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState('');
  const [preview, setPreview] = useState(value);
  const wrapRef = useRef(null);

  useEffect(() => setPreview(value), [value]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = TONES.find((t) => t.id === value) || TONES[0];
  const shown = TONES.find((t) => t.id === preview) || current;

  const pick = async (tone) => {
    if (tone === value || saving) return;
    setSaving(tone);
    try {
      const res = await fetch('/api/coach/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone }),
      });
      if (res.ok) onChange?.(tone);
    } catch {
      // silencioso: no bloquea el chat
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="tone-menu" ref={wrapRef}>
      <button type="button" className="tone-trigger" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {current.label}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="tone-panel" role="menu">
          <div className="tone-chips">
            {TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tone-chip"
                aria-pressed={value === t.id}
                disabled={!!saving}
                onMouseEnter={() => setPreview(t.id)}
                onFocus={() => setPreview(t.id)}
                onMouseLeave={() => setPreview(value)}
                onClick={() => pick(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="tone-preview">{shown.preview}</div>
        </div>
      )}
    </div>
  );
}
