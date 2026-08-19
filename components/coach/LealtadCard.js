'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { getLealtad } from '@/lib/coach/lealtadClient';

// Tarjeta de LEALTAD: agradecimiento por antigüedad (permanente y automático, SIN presión).
// Progreso cálido "llevas {meses_pro} de {proximo_tramo.meses} meses → {meses_gratis} gratis".
// CERO cuenta-regresiva / "reclama antes de que expire" / dark pattern. Deploy-safe: null → no renderiza.
function mesesGratisTxt(n) {
  const m = Number(n) || 0;
  return `${m} ${m === 1 ? 'mes' : 'meses'} gratis`;
}

export default function LealtadCard() {
  const [l, setL] = useState(undefined); // undefined=cargando · null=degrade · objeto=listo

  useEffect(() => {
    let vivo = true;
    getLealtad().then((d) => { if (vivo) setL(d); });
    return () => { vivo = false; };
  }, []);

  if (!l) return null; // null/undefined (404/{}/sin tramo) → se OCULTA sin errores

  const tramo = l.proximo_tramo;
  const otorgados = Array.isArray(l.otorgados) ? l.otorgados : [];
  const regaladosTotal = otorgados.reduce((s, o) => s + (Number(o?.meses_gratis) || 0), 0);

  // Sin próximo tramo pero con regalos → agradecimiento cálido (ya te lo dimos, gracias por seguir).
  if (!tramo) {
    return (
      <div className="card" role="status" style={{ background: 'linear-gradient(135deg, var(--brand-tint), var(--surface))', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
        <span style={{ color: 'var(--brand-strong)', flexShrink: 0 }}><Icon name="star" size={22} /></span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>¡Gracias por acompañarnos!</div>
          <div className="c-subtitle">
            {regaladosTotal > 0
              ? `Ya te regalamos ${mesesGratisTxt(regaladosTotal)} por tu constancia. Un gusto seguir contigo.`
              : 'Un gusto seguir contigo.'}
          </div>
        </div>
      </div>
    );
  }

  const meta = tramo.meses > 0 ? tramo.meses : 1;
  const activo = Math.max(0, Math.min(l.meses_pro || 0, meta));
  const pct = Math.min(activo / meta, 1);

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 'var(--s2)' }}>
        <span style={{ color: 'var(--brand-strong)', display: 'inline-flex' }}><Icon name="star" size={16} /></span>
        <span className="c-subtitle" style={{ margin: 0 }}>Gracias por seguir aquí</span>
      </div>
      <p className="c-body" style={{ margin: '0 0 var(--s3)', color: 'var(--text)' }}>
        Llevas <span className="num" style={{ fontWeight: 700 }}>{activo}</span> de <span className="num" style={{ fontWeight: 700 }}>{meta}</span> meses.
        {tramo.meses_gratis > 0 ? <> Al llegar, <strong>{mesesGratisTxt(tramo.meses_gratis)}</strong>{' '}— nuestro modo de agradecerte.</> : null}
      </p>
      <div role="progressbar" aria-valuenow={activo} aria-valuemin={0} aria-valuemax={meta} aria-label={`${activo} de ${meta} meses`}
        style={{ height: 8, borderRadius: 'var(--r-pill)', background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: 'var(--brand)', borderRadius: 'var(--r-pill)', transition: 'width var(--dur-ring) var(--ease-spring)' }} />
      </div>
      {regaladosTotal > 0 && (
        <p className="c-subtitle" style={{ margin: 'var(--s2) 0 0' }}>Ya te regalamos {mesesGratisTxt(regaladosTotal)}. Gracias.</p>
      )}
    </div>
  );
}
