'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { getConsejo, fallbackConsejo } from '@/lib/coach/consejoClient';
import { compartirConsejo } from '@/lib/coach/shareCard';

// Tarjeta HERO del Consejo del Día en HOME. Consume el schema del backend {foco,titulo,cuerpo,
// dato_motor?,cta?} — la UI NO inventa contenido. Nunca vacío (fallback genérico). Compartir genera
// una imagen SIN PII (sólo el mensaje + branding). Deploy-safe: si el endpoint falla, no rompe HOME.
export default function ConsejoDelDia({ onCta }) {
  const [consejo, setConsejo] = useState(undefined); // undefined = cargando · objeto = listo
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

  useEffect(() => {
    let vivo = true;
    getConsejo().then((c) => { if (vivo) setConsejo(c || fallbackConsejo()); });
    return () => { vivo = false; };
  }, []);

  if (consejo === undefined) return <ConsejoSkeleton />;

  const esRacha = consejo.foco === 'racha' || consejo.foco === 'progreso';
  const compartir = async () => {
    setSharing(true); setShareMsg('');
    const r = await compartirConsejo({ titulo: consejo.titulo, cuerpo: consejo.cuerpo, foco: consejo.foco });
    setSharing(false);
    if (!r.ok) setShareMsg('No se pudo compartir en este dispositivo.');
    else if (r.motivo === 'descarga') setShareMsg('Imagen guardada para compartir.');
  };

  return (
    <section
      aria-label="Consejo del día"
      className="card"
      style={{ background: 'linear-gradient(135deg, var(--brand-tint), var(--surface))', border: '1px solid var(--border)', boxShadow: 'var(--shadow-1)' }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--brand-strong)', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
        <Icon name={esRacha ? 'flame' : 'sparkles'} size={14} /> {esRacha ? 'Tu racha' : 'Consejo de hoy'}
      </div>

      <h2 className="c-title" style={{ fontSize: 20, lineHeight: '26px', margin: 'var(--s2) 0 var(--s1)' }}>{consejo.titulo}</h2>
      {consejo.cuerpo && <p className="c-body" style={{ margin: 0, color: 'var(--text)' }}>{consejo.cuerpo}</p>}

      {consejo.dato_motor?.label != null && consejo.dato_motor?.valor != null && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 'var(--s3)', padding: '4px 10px', borderRadius: 'var(--r-pill)', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 13 }}>
          <span style={{ color: 'var(--text-2)' }}>{consejo.dato_motor.label}:</span>
          <span className="num" style={{ fontWeight: 700, color: 'var(--text)' }}>{consejo.dato_motor.valor}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s2)', marginTop: 'var(--s4)' }}>
        {consejo.cta?.label && (
          <button type="button" className="btn btn-primary" onClick={() => onCta?.(consejo.cta)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {consejo.cta.label}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={compartir} disabled={sharing} aria-label="Compartir el consejo de hoy" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 'var(--touch)' }}>
          <Icon name="arrowUp" size={16} /> {sharing ? 'Preparando…' : 'Compartir'}
        </button>
      </div>

      {shareMsg && <div role="status" aria-live="polite" className="c-subtitle" style={{ marginTop: 'var(--s2)' }}>{shareMsg}</div>}
    </section>
  );
}

function ConsejoSkeleton() {
  const bar = (w) => <div style={{ height: 14, width: w, borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }} />;
  return (
    <section className="card" aria-busy="true" aria-label="Cargando el consejo del día" style={{ background: 'linear-gradient(135deg, var(--brand-tint), var(--surface))', border: '1px solid var(--border)', opacity: 0.75 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
        {bar('40%')}
        {bar('80%')}
        {bar('90%')}
      </div>
    </section>
  );
}
