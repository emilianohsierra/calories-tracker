'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { getLealtad } from '@/lib/coach/lealtadClient';

// Tarjeta de LEALTAD: agradecimiento por seguir aquí (SIN presión). Muestra el progreso del tramo
// ("llevas 4 de 6 meses → 1 mes gratis") con tono gracias-por-seguir. CERO countdown / "reclama antes
// de que expire" / dark pattern. Al otorgarse → celebración cálida. Deploy-safe: null → no renderiza.
export default function LealtadCard() {
  const [l, setL] = useState(undefined); // undefined=cargando · null=degrade · objeto=listo

  useEffect(() => {
    let vivo = true;
    getLealtad().then((d) => { if (vivo) setL(d); });
    return () => { vivo = false; };
  }, []);

  if (l === null) return null;          // sin tramo / sin backend → no se muestra
  if (l === undefined) return null;     // carga: no ocupamos espacio (no es crítico)

  const meta = l.meses_meta > 0 ? l.meses_meta : 1;
  const activo = Math.max(0, Math.min(l.meses_activo || 0, meta));
  const pct = Math.min(activo / meta, 1);

  if (l.otorgada) {
    return (
      <div className="card" role="status" style={{ background: 'linear-gradient(135deg, var(--brand-tint), var(--surface))', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
        <span style={{ color: 'var(--brand-strong)', flexShrink: 0 }}><Icon name="star" size={22} /></span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>¡Gracias por acompañarnos!</div>
          <div className="c-subtitle">{l.mensaje || `Ya tienes ${l.recompensa || 'tu recompensa'}. Un gusto seguir contigo.`}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 'var(--s2)' }}>
        <span style={{ color: 'var(--brand-strong)', display: 'inline-flex' }}><Icon name="star" size={16} /></span>
        <span className="c-subtitle" style={{ margin: 0 }}>Gracias por seguir aquí</span>
      </div>
      <p className="c-body" style={{ margin: '0 0 var(--s3)', color: 'var(--text)' }}>
        Llevas <span className="num" style={{ fontWeight: 700 }}>{activo}</span> de <span className="num" style={{ fontWeight: 700 }}>{meta}</span> meses.
        {l.recompensa ? <> Al llegar, <strong>{l.recompensa}</strong>{' '}— nuestro modo de agradecerte.</> : null}
      </p>
      <div role="progressbar" aria-valuenow={activo} aria-valuemin={0} aria-valuemax={meta} aria-label={`${activo} de ${meta} meses`}
        style={{ height: 8, borderRadius: 'var(--r-pill)', background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: 'var(--brand)', borderRadius: 'var(--r-pill)', transition: 'width var(--dur-ring) var(--ease-spring)' }} />
      </div>
    </div>
  );
}
