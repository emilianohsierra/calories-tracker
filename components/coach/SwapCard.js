'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { getSwap, postSwapOferta } from '@/lib/coach/swapClient';

// Feature B — tarjeta SUAVE de swap proactivo (NUNCA pop-up). "Cambia X por Y porque te acerca a tu
// meta", tono MEJORAR-NO-PROHIBIR (del backend, la UI no inventa ni juzga). 'Ahora no' SIN culpa
// (registra para el back-off). Consistente con la tarjeta del Consejo/repaso (brand-tint suave).
// Deploy-safe: si no hay swap (o el endpoint falla) → no renderiza nada.
export default function SwapCard() {
  const [swap, setSwap] = useState(null);
  const [estado, setEstado] = useState('oferta'); // oferta | oculto | listo

  useEffect(() => {
    let vivo = true;
    getSwap().then((s) => { if (vivo) setSwap(s || null); });
    return () => { vivo = false; };
  }, []);

  if (!swap || estado === 'oculto') return null;

  const ahoraNo = () => { postSwapOferta(false); setEstado('oculto'); }; // back-off, sin culpa
  const meInteresa = () => { postSwapOferta(true); setEstado('listo'); };

  return (
    <div style={{ margin: '0 var(--s4) var(--s2)', padding: 'var(--s3) var(--s4)', borderRadius: 'var(--r-md)', background: 'var(--brand-tint)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--brand-strong)', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
        <Icon name="refresh" size={14} /> Un cambio que te ayudaría
      </div>

      {estado === 'listo' ? (
        <p className="c-body" role="status" style={{ margin: 'var(--s2) 0 0', color: 'var(--text)' }}>
          <Icon name="check" size={15} /> Anotado. Cuando quieras, cámbialo — sin prisa.
        </p>
      ) : (
        <>
          <p className="c-body" style={{ margin: 'var(--s2) 0 4px', color: 'var(--text)', fontWeight: 600 }}>
            Cambia {swap.de} por {swap.a}
          </p>
          {swap.razon && <p className="c-subtitle" style={{ margin: '0 0 var(--s3)', color: 'var(--text-2)' }}>{swap.razon}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
            <button type="button" className="btn btn-primary" onClick={meInteresa} style={{ padding: '6px 14px', minHeight: 'var(--touch)' }}>Me interesa</button>
            <button type="button" className="link-btn" onClick={ahoraNo} aria-label="Ahora no" style={{ minHeight: 'var(--touch)' }}>Ahora no</button>
          </div>
        </>
      )}
    </div>
  );
}
