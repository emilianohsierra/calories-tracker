'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';

// Hoja de AJUSTES de notificaciones del coach. Contrato: GET /api/coach/notification-prefs
// → { prefs }; PUT body PARCIAL → { prefs efectivas }. El server sanea.
const MODOS = [
  { id: 'tranquilo', label: 'Tranquilo' },
  { id: 'normal', label: 'Normal' },
  { id: 'entrenador', label: 'Entrenador' },
];
const TIPOS = [
  { key: 'on_missed_meal', label: 'Comida sin registrar' },
  { key: 'on_low_protein', label: 'Proteína baja' },
  { key: 'on_streak', label: 'Racha' },
  { key: 'on_weekly_review', label: 'Resumen semanal' },
  { key: 'on_user_inactivity', label: 'Te extrañamos (inactividad)' },
];
const HORAS = Array.from({ length: 24 }, (_, h) => h);

function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 26, flexShrink: 0, borderRadius: 'var(--r-pill)', border: '1px solid var(--border)',
        background: checked ? 'var(--brand)' : 'var(--surface-2)', position: 'relative', cursor: disabled ? 'default' : 'pointer',
        transition: 'background var(--dur-base) var(--ease-standard)', opacity: disabled ? 0.5 : 1, padding: 0,
      }}
    >
      <span aria-hidden="true" style={{ position: 'absolute', top: 2, left: checked ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: checked ? 'var(--brand-ink)' : 'var(--surface)', boxShadow: 'var(--shadow-1)', transition: 'left var(--dur-base) var(--ease-standard)' }} />
    </button>
  );
}

export default function NotificationSettings({ onClose }) {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    fetch('/api/coach/notification-prefs')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.prefs) setPrefs(d.prefs); })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  // PUT parcial optimista; reconcilia con las prefs efectivas que devuelve el server.
  const save = (patch) => {
    setPrefs((p) => ({ ...p, ...patch }));
    fetch('/api/coach/notification-prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.prefs) setPrefs(d.prefs); })
      .catch(() => {});
  };

  const p = prefs || {};
  const off = !p.proactive_on;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Ajustes de avisos" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s4)' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Ajustes de avisos</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ display: 'inline-flex', width: 'var(--touch)', height: 'var(--touch)', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', margin: '-8px -8px 0 0' }}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {loading && <p className="c-subtitle" aria-live="polite" style={{ textAlign: 'center' }}>Cargando…</p>}

        {!loading && prefs && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
            {/* Master */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s3)' }}>
              <span>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Avisos proactivos</span>
                <span className="c-subtitle">Tu coach te escribe cuando detecta algo útil.</span>
              </span>
              <Switch checked={p.proactive_on} onChange={(v) => save({ proactive_on: v })} label="Avisos proactivos" />
            </div>

            {/* Modo */}
            <div style={{ opacity: off ? 0.5 : 1 }}>
              <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>Tono e intensidad</p>
              <div className="segmented" role="group" aria-label="Modo de avisos">
                {MODOS.map((m) => (
                  <button key={m.id} type="button" aria-pressed={p.modo === m.id} disabled={off} onClick={() => save({ modo: m.id })}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Horario silencioso */}
            <div style={{ opacity: off ? 0.5 : 1 }}>
              <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>No molestar</p>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="ns-qs">Desde</label>
                  <select id="ns-qs" value={p.quiet_start ?? 22} disabled={off} onChange={(e) => save({ quiet_start: Number(e.target.value) })}>
                    {HORAS.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ns-qe">Hasta</label>
                  <select id="ns-qe" value={p.quiet_end ?? 8} disabled={off} onChange={(e) => save({ quiet_end: Number(e.target.value) })}>
                    {HORAS.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Toggles por tipo */}
            <div style={{ opacity: off ? 0.5 : 1 }}>
              <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>¿De qué te aviso?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
                {TIPOS.map((t) => (
                  <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s3)' }}>
                    <span style={{ fontSize: 14, color: 'var(--text)' }}>{t.label}</span>
                    <Switch checked={p[t.key]} disabled={off} onChange={(v) => save({ [t.key]: v })} label={t.label} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
