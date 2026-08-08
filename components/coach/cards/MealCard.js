'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';

// Tarjeta de comida sugerida (Karpathy §4: bloque `meal`). Título + chips de macros +
// ingredientes. "Registrar" reusa el guardado existente vía onRegister (POST /api/meals).
// pantryUses: nº de ingredientes que salen de la despensa del usuario ("¿qué puedo comer?").
export default function MealCard({ titulo, kcal = 0, prot_g = 0, carb_g = 0, gras_g = 0, ingredientes = [], tiempo_min = 0, costo = '', pantryUses = 0, onRegister }) {
  const [state, setState] = useState('idle'); // idle | saving | done

  const register = async () => {
    if (state !== 'idle' || !onRegister) return;
    setState('saving');
    try {
      const ok = await onRegister({ titulo, kcal, prot_g, carb_g, gras_g, ingredientes });
      setState(ok ? 'done' : 'idle');
    } catch {
      setState('idle');
    }
  };

  return (
    <div className="c-card c-card--meal">
      <div className="c-title">{titulo}</div>
      <div className="macro-row">
        <span className="macro-chip num"><i className="macro-dot" style={{ background: 'var(--brand)' }} />{Math.round(kcal)} kcal</span>
        <span className="macro-chip num"><i className="macro-dot" style={{ background: 'var(--protein)' }} />{Math.round(prot_g)} g P</span>
        <span className="macro-chip num"><i className="macro-dot" style={{ background: 'var(--carbs)' }} />{Math.round(carb_g)} g C</span>
        <span className="macro-chip num"><i className="macro-dot" style={{ background: 'var(--fat)' }} />{Math.round(gras_g)} g G</span>
      </div>
      {ingredientes?.length > 0 && (
        <div className="c-subtitle meal-ings">{ingredientes.join(', ')}</div>
      )}
      {(tiempo_min > 0 || costo) && (
        <div className="ring-caption num">{tiempo_min > 0 ? `${Math.round(tiempo_min)} min` : ''}{tiempo_min > 0 && costo ? ' · ' : ''}{costo}</div>
      )}
      {pantryUses > 0 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--brand-strong)' }}>
          <Icon name="box" size={13} /> usa {pantryUses} de tu despensa
        </div>
      )}
      {onRegister ? (
        <div className="c-card__actions">
          <button type="button" className="btn btn-primary" onClick={register} disabled={state !== 'idle'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {state === 'saving' ? 'Registrando…' : state === 'done' ? <><Icon name="check" size={15} /> Registrado</> : 'Registrar'}
          </button>
        </div>
      ) : (
        // Sin acción viva (p.ej. propuesta cargada del historial): registro/estimación no
        // accionable, para no duplicar la comida al recargar.
        <div className="ring-caption">Estimado</div>
      )}
    </div>
  );
}
