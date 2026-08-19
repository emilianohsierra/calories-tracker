'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import LogroBadge from '@/components/coach/LogroBadge';
import LealtadCard from '@/components/coach/LealtadCard';
import Mascota, { estadoMascota, mascotaOculta, setMascotaOculta } from '@/components/coach/Mascota';
import { useModalA11y } from '@/lib/ui/useModalA11y';

// "Mi progreso" (§2/§3/§4): XP + nivel (barra), racha con recuperación SIN culpa, resumen semanal
// sin culpa, y galería de logros (desbloqueados vivos, ocultos como silueta). Estética premium:
// cards + barras calmadas + badges elegantes; nada de casino/confeti. Todo del backend (data).
function XpBar({ xp }) {
  if (!xp) return null;
  const meta = xp.meta > 0 ? xp.meta : 1;
  const pct = Math.max(0, Math.min((xp.xp || 0) / meta, 1));
  return (
    <div className="card" style={{ marginBottom: 'var(--s3)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--s2)', marginBottom: 'var(--s2)' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Nivel {xp.nivel} · {xp.nombre}</span>
        <span className="num c-subtitle">{Math.round(xp.xp || 0)} / {Math.round(meta)} XP</span>
      </div>
      <div role="progressbar" aria-valuenow={Math.round(xp.xp || 0)} aria-valuemin={0} aria-valuemax={Math.round(meta)} aria-label={`Nivel ${xp.nivel}, ${xp.nombre}`}
        style={{ height: 8, borderRadius: 'var(--r-pill)', background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: 'var(--brand)', borderRadius: 'var(--r-pill)', transition: 'width var(--dur-ring) var(--ease-spring)' }} />
      </div>
    </div>
  );
}

function Racha({ racha }) {
  if (!racha) return null;
  // Recuperación SIN culpa: si el backend manda `recuperacion`, tono cálido; cero rojo/reproche.
  if (racha.recuperacion) {
    return (
      <div className="card" style={{ marginBottom: 'var(--s3)', display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
        <span style={{ color: 'var(--text-3)', flexShrink: 0 }}><Icon name="flame" size={22} /></span>
        <span className="c-body" style={{ color: 'var(--text-2)' }}>{racha.recuperacion}</span>
      </div>
    );
  }
  return (
    <div className="card" style={{ marginBottom: 'var(--s3)', display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
      <span style={{ color: 'var(--brand-strong)', flexShrink: 0 }}><Icon name="flame" size={22} /></span>
      <div>
        <div className="num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{racha.dias} {racha.dias === 1 ? 'día' : 'días'}</div>
        <div className="c-subtitle">{racha.congelada ? 'Racha protegida — tienes un día de gracia.' : 'de racha registrando. Sigue así.'}</div>
      </div>
    </div>
  );
}

export default function MiProgreso({ data, onClose }) {
  const modalRef = useModalA11y(onClose);
  const logros = Array.isArray(data?.logros) ? [...data.logros].sort((a, b) => (b.desbloqueado - a.desbloqueado)) : [];
  const semanal = data?.semanal;
  const mascota = estadoMascota(data); // null → no se renderiza (respeta mascota:null del backend)

  // Opt-out de la mascota (ocultar sin culpa). Refleja la preferencia y re-renderiza el toggle.
  const [oculta, setOculta] = useState(false);
  useEffect(() => {
    const sync = () => setOculta(mascotaOculta());
    sync();
    window.addEventListener('mascota-pref', sync);
    return () => window.removeEventListener('mascota-pref', sync);
  }, []);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Mi progreso" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s4)' }}>
          <h2 style={{ margin: 0, fontSize: 18, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="trending" size={18} /> Mi progreso
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ display: 'inline-flex', width: 'var(--touch)', height: 'var(--touch)', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', margin: '-8px -8px 0 0' }}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Mascota (grande) como avatar del progreso + opt-out sin culpa. mascota:null → no se pinta. */}
        {mascota && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 'var(--s3)' }}>
            {!oculta && <Mascota {...mascota} size={104} />}
            <button type="button" className="link-btn" onClick={() => setMascotaOculta(!oculta)} style={{ minHeight: 'var(--touch)' }}>
              {oculta ? 'Mostrar compañero' : 'Ocultar compañero'}
            </button>
          </div>
        )}

        <XpBar xp={data?.xp} />
        <Racha racha={data?.racha} />
        <LealtadCard />

        {semanal && (Array.isArray(semanal.insights) ? semanal.insights.length : 0) > 0 && (
          <div className="card" style={{ marginBottom: 'var(--s3)' }}>
            <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>Tu semana</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {semanal.insights.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--brand-strong)', flexShrink: 0, marginTop: 1 }}><Icon name="check" size={15} /></span>
                  <span className="c-body" style={{ color: 'var(--text)' }}>{t}</span>
                </div>
              ))}
            </div>
            {semanal.foco && <p className="c-subtitle" style={{ margin: 'var(--s2) 0 0', color: 'var(--brand-strong)' }}>{semanal.foco}</p>}
          </div>
        )}

        {logros.length > 0 && (
          <div>
            <p className="c-subtitle" style={{ margin: '0 0 var(--s3)' }}>Logros</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s3)', justifyContent: 'flex-start' }}>
              {logros.map((l) => <LogroBadge key={l.id} logro={l} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
