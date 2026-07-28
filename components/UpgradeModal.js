'use client';

import { useState } from 'react';

const PRICE_LABEL = '$99 MXN/mes';

// variant: 'plans' (tabla comparativa) | 'limit' (paywall al agotar el mes, 3 salidas)
export default function UpgradeModal({ variant = 'plans', usage, resetLabel, onClose, onManual }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isPro = usage?.plan === 'pro';

  const go = async (endpoint) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'No se pudo continuar.');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const subscribe = () => go('/api/checkout');
  const manage = () => go('/api/portal');

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Plan Pro">
        {variant === 'limit' ? (
          <>
            <h2>Llegaste a tus análisis gratis del mes 🎉</h2>
            <p>
              Con <strong>Pro</strong> analizas con IA todas las comidas que quieras, sin contar. Y
              mientras, siempre puedes registrar a mano gratis.
            </p>
            {error && <div className="error-banner">{error}</div>}
            <div className="plan-actions">
              <button type="button" className="btn btn-primary" onClick={subscribe} disabled={busy}>
                {busy ? 'Un momento…' : `Hazte Pro — ${PRICE_LABEL}`}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onManual} disabled={busy}>
                Registrar a mano
              </button>
              <button type="button" className="link-btn" onClick={onClose} disabled={busy}>
                {resetLabel ? `Tus análisis se reinician el ${resetLabel}` : 'Cerrar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>{isPro ? 'Tu plan Pro' : 'Hazte Pro'}</h2>
            {error && <div className="error-banner">{error}</div>}
            <table className="plan-table">
              <thead>
                <tr>
                  <th>Función</th>
                  <th>Free</th>
                  <th>Pro</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Análisis de foto con IA</td>
                  <td>10 / mes</td>
                  <td>Ilimitado*</td>
                </tr>
                <tr>
                  <td>Registro manual</td>
                  <td>Ilimitado</td>
                  <td>Ilimitado</td>
                </tr>
                <tr>
                  <td>Resumen diario y meta</td>
                  <td>✅</td>
                  <td>✅</td>
                </tr>
                <tr>
                  <td>Reanálisis con corrección</td>
                  <td>—</td>
                  <td>✅</td>
                </tr>
              </tbody>
            </table>
            <p className="plan-fineprint">*Uso justo. Cancela cuando quieras. Sin permanencia.</p>

            {isPro ? (
              <div className="plan-actions">
                {usage?.subscription?.cancel_at_period_end ? (
                  <p className="confidence-note">
                    Seguirás siendo Pro hasta el fin del periodo; luego pasarás a Free.
                  </p>
                ) : null}
                <button type="button" className="btn btn-primary" onClick={manage} disabled={busy}>
                  {busy ? 'Un momento…' : 'Administrar suscripción'}
                </button>
                <button type="button" className="link-btn" onClick={onClose} disabled={busy}>
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="plan-actions">
                <button type="button" className="btn btn-primary" onClick={subscribe} disabled={busy}>
                  {busy ? 'Un momento…' : `Suscribirme por ${PRICE_LABEL}`}
                </button>
                <button type="button" className="link-btn" onClick={onClose} disabled={busy}>
                  Ahora no
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
