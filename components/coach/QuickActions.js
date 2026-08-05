'use client';

// Chips de acciones rápidas (Rams §6). Iconos lineales, scroll horizontal con snap.
// Visibles con el hilo inactivo; se ocultan al enviar (el padre controla con `visible`).
const ICONS = {
  camera: 'M3 5.5h2l1-1.5h4l1 1.5h2v7H3zM8 6.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  help: 'M6 6a2 2 0 113 1.7c-.6.4-1 .8-1 1.8M8 12h.01',
  trend: 'M2.5 10.5l3-3 2 2 4-4M11 5.5h1.5V7',
  plan: 'M4 3.5h8v9H4zM6 6h4M6 8.5h4',
  target: 'M8 3v2M8 11v2M3 8h2M11 8h2M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
};

export default function QuickActions({ visible, onAnalizar, onSend, onNav, onPuedoComer }) {
  if (!visible) return null;
  const items = [
    { id: 'analizar', label: 'Analizar comida', icon: 'camera', run: () => onAnalizar?.() },
    // Endpoint DEDICADO (no chat): habilita 429 → paywall. Ver app/coach/page.js.
    { id: 'puedo_comer', label: '¿Qué puedo comer?', icon: 'help', run: () => onPuedoComer?.() },
    { id: 'progreso', label: 'Mi progreso', icon: 'trend', run: () => onSend?.('¿Cómo voy esta semana?') },
    { id: 'plan_hoy', label: 'Plan de hoy', icon: 'plan', run: () => onSend?.('¿Cuál es mi plan de hoy?') },
    { id: 'cambiar_objetivo', label: 'Cambiar objetivo', icon: 'target', run: () => onNav?.('/perfil') },
  ];
  return (
    <div className="quick-actions" role="group" aria-label="Acciones rápidas">
      {items.map((it) => (
        <button key={it.id} type="button" className="chip-action" onClick={it.run}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICONS[it.icon]} />
          </svg>
          {it.label}
        </button>
      ))}
    </div>
  );
}
