'use client';

import { useState } from 'react';

// Selector de las 4 personalidades (GRATIS). Cambia el tono, no la ciencia.
const TONES = [
  { id: 'amigable', label: 'Amigable' },
  { id: 'entrenador', label: 'Entrenador' },
  { id: 'analitico', label: 'Analítico' },
  { id: 'tranquilo', label: 'Tranquilo' },
];

export default function PersonalityPicker({ value, onChange }) {
  const [saving, setSaving] = useState('');

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
    <div className="tone-picker" role="group" aria-label="Personalidad del coach">
      {TONES.map((t) => (
        <button
          key={t.id}
          type="button"
          className="tone-chip"
          aria-pressed={value === t.id}
          disabled={!!saving}
          onClick={() => pick(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
