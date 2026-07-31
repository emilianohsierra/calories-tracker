'use client';

import { useEffect, useState } from 'react';
import { getStoredTheme, setTheme, applyTheme, resolveTheme, THEME_COLORS } from '@/lib/theme';

// Segmented Claro · Sistema · Oscuro (default Sistema). Reusable en toda la app.
// Iconos lineales (sol/monitor/luna), nunca emoji.
const ICONS = {
  light: <path d="M8 2.5v1.5M8 12v1.5M2.5 8H4M12 8h1.5M4.2 4.2l1 1M10.8 10.8l1 1M11.8 4.2l-1 1M5.2 10.8l-1 1M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />,
  system: <path d="M2.5 3.5h11v7h-11zM6 13h4M8 10.5V13" />,
  dark: <path d="M12.5 9.3A5 5 0 016.7 3.5a5 5 0 100 9 5 5 0 005.8-3.2z" />,
};
const OPTS = [
  { id: 'light', label: 'Claro' },
  { id: 'system', label: 'Sistema' },
  { id: 'dark', label: 'Oscuro' },
];

export default function ThemeToggle({ compact = false }) {
  const [mode, setMode] = useState('system');

  useEffect(() => {
    const m = getStoredTheme();
    setMode(m);
    applyTheme(m); // asegura consistencia con el script anti-flash
    // En modo "system", seguir en vivo los cambios del SO (para el meta theme-color).
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (getStoredTheme() === 'system') {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', THEME_COLORS[resolveTheme('system')]);
      }
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const pick = (id) => {
    setMode(id);
    setTheme(id);
  };

  return (
    <div className={`theme-toggle${compact ? ' theme-toggle--compact' : ''}`} role="group" aria-label="Apariencia">
      {OPTS.map((o) => (
        <button
          key={o.id}
          type="button"
          className="theme-seg"
          aria-pressed={mode === o.id}
          title={o.label}
          onClick={() => pick(o.id)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONS[o.id]}
          </svg>
          {!compact && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}
