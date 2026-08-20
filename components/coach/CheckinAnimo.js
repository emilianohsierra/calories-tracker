'use client';

import { useState } from 'react';

// Gamificación V2.1 · CHECK-IN de ánimo/energía con CARITAS 1-5. OPCIONAL, 1/día, ofrecido SUAVE en HOY.
// TCA (línea roja): es BIENESTAR, no báscula — cero peso, cero calorías, cero culpa; nunca evalúa "qué tan
// bien comiste". Si lo ignora, no pasa nada (sin modal forzado). Fase 1 = UI por props; POST /api/coach/checkin
// llega en Fase 2. Callback onSubmit({ animo, energia }) — animo: enum cualitativo; energia: 1..5
// (shape de la RPC registrar_checkin). onDismiss opcional para "Ahora no" (sin culpa).

const CARITAS = [
  { energia: 1, animo: 'bajo', label: 'Muy bajo' },
  { energia: 2, animo: 'cansado', label: 'Bajo' },
  { energia: 3, animo: 'normal', label: 'Normal' },
  { energia: 4, animo: 'bien', label: 'Bien' },
  { energia: 5, animo: 'genial', label: 'Genial' },
];

// Boca por nivel (1 = decae ↔ 5 = sonríe). Ánimo/energía cualitativo, NUNCA cuerpo. Reduced-motion-safe (sin animación).
const BOCAS = {
  1: 'M12 22 q6 -4 12 0',
  2: 'M12 21 q6 -2 12 0',
  3: 'M12 20 h12',
  4: 'M12 20 q6 3 12 0',
  5: 'M12 19 q6 5 12 0',
};

function Cara({ energia, activa, size = 32 }) {
  const trazo = activa ? 'var(--brand-ink)' : 'var(--text-2)';
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} aria-hidden="true">
      <circle cx="18" cy="18" r="16" fill={activa ? 'var(--brand)' : 'var(--surface-2)'} />
      <circle cx="13" cy="15" r="1.7" fill={trazo} />
      <circle cx="23" cy="15" r="1.7" fill={trazo} />
      <path d={BOCAS[energia]} fill="none" stroke={trazo} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function CheckinAnimo({ hechoHoy = false, valorHoy = null, onSubmit, onDismiss }) {
  const [sel, setSel] = useState(valorHoy?.energia ?? null);
  const [enviado, setEnviado] = useState(hechoHoy);

  // Estado "ya registrado hoy" (1/día): micro-reconocimiento cálido, sin juicio.
  if (enviado) {
    const c = CARITAS.find((x) => x.energia === (sel ?? valorHoy?.energia)) || null;
    return (
      <div className="card" role="status" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
        {c && <Cara energia={c.energia} activa size={28} />}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Gracias por registrarlo</div>
          <div className="c-subtitle">Anotamos cómo te sientes hoy{c ? `: ${c.label.toLowerCase()}` : ''}. Nos vemos mañana.</div>
        </div>
      </div>
    );
  }

  const elegir = (c) => {
    setSel(c.energia);
    setEnviado(true);
    onSubmit?.({ animo: c.animo, energia: c.energia });
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 'var(--s3)' }}>
        <span className="c-title" style={{ margin: 0 }}>¿Cómo te sientes hoy?</span>
      </div>
      <p className="c-subtitle" style={{ margin: '0 0 var(--s3)' }}>Un momento para ti. Es opcional y solo tú lo ves.</p>

      <div role="group" aria-label="Elige cómo te sientes hoy" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--s1)' }}>
        {CARITAS.map((c) => {
          const activa = sel === c.energia;
          return (
            <button
              key={c.energia}
              type="button"
              onClick={() => elegir(c)}
              aria-pressed={activa}
              aria-label={c.label}
              title={c.label}
              style={{
                display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                minWidth: 'var(--touch)', minHeight: 'var(--touch)', padding: '4px 2px',
                border: 'none', background: 'none', cursor: 'pointer', borderRadius: 'var(--r-md)',
              }}
            >
              <Cara energia={c.energia} activa={activa} />
              <span className="c-eyebrow" style={{ color: activa ? 'var(--brand-strong)' : 'var(--text-3)' }}>{c.label}</span>
            </button>
          );
        })}
      </div>

      {onDismiss && (
        <div style={{ marginTop: 'var(--s2)', textAlign: 'center' }}>
          <button type="button" className="link-btn" onClick={onDismiss} style={{ minHeight: 'var(--touch)' }}>Ahora no</button>
        </div>
      )}
    </div>
  );
}
