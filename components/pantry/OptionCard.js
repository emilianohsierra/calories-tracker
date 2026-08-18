'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import ConfidenceBadge from '@/components/pantry/ConfidenceBadge';
import { PROCEDENCIA_TO_CONFIDENCE } from '@/lib/pantry/constants';

// Tarjeta de Opción para "¿qué puedo comer?" — consume la forma EXACTA de Karpathy:
// { items:[{pantry_item_id,cantidad}], titulo, kcal, macros:{prot,carb,gras}, fibra,
//   gramos, usa_n_despensa, procedencia:'verificado|introducido|estimado',
//   cuadre:{kcalPct,protPct} }
// onRegister recibe option.items (para descontar de despensa + registrar la comida).
export default function OptionCard({ option, onRegister }) {
  const [state, setState] = useState('idle'); // idle | saving | done
  const { titulo, kcal = 0, macros = {}, usa_n_despensa = 0, procedencia = 'estimado', cuadre = {}, items = [] } = option || {};
  // Recomendaciones v2: `porque` (por qué encaja) + `estimado` (macros aproximados → prefijo '~')
  // + `rangos` (catálogo: { kcal:[min,max], prot, carb, gras, fibra }). Todo del backend.
  const porque = option?.porque || option?.por_que || '';
  const estimado = option?.estimado === true || procedencia === 'estimado';
  const aprox = estimado ? '~' : '';
  const rangos = option?.rangos || null;
  // Muestra un rango "min–max" si el backend lo manda; si no, el valor con prefijo '~' cuando es estimado.
  const fmt = (val, r) => {
    if (Array.isArray(r) && r.length === 2) return `~${Math.round(r[0])}–${Math.round(r[1])}`;
    if (typeof r === 'number') return `${aprox}${Math.round(r)}`;
    return `${aprox}${Math.round(val || 0)}`;
  };

  const register = async () => {
    if (state !== 'idle' || !onRegister) return;
    setState('saving');
    try {
      const ok = await onRegister(items, option);
      setState(ok === false ? 'idle' : 'done');
    } catch {
      setState('idle');
    }
  };

  const badgeLevel = PROCEDENCIA_TO_CONFIDENCE[procedencia] || 'ai';

  return (
    <div className="c-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--s2)' }}>
        <span className="c-title">{titulo}</span>
        <ConfidenceBadge level={badgeLevel} compact />
      </div>

      {porque && <div className="c-subtitle" style={{ color: 'var(--text-2)' }}>{porque}</div>}

      <div className="macro-row">
        <span className="macro-chip num"><i className="macro-dot" style={{ background: 'var(--brand)' }} />{fmt(kcal, rangos?.kcal)} kcal</span>
        <span className="macro-chip num"><i className="macro-dot" style={{ background: 'var(--protein)' }} />{fmt(macros.prot, rangos?.prot)} g P</span>
        <span className="macro-chip num"><i className="macro-dot" style={{ background: 'var(--carbs)' }} />{fmt(macros.carb, rangos?.carb)} g C</span>
        <span className="macro-chip num"><i className="macro-dot" style={{ background: 'var(--fat)' }} />{fmt(macros.gras, rangos?.gras)} g G</span>
      </div>
      {estimado && <div className="ring-caption" style={{ color: 'var(--text-3)' }}>Macros estimados</div>}

      {usa_n_despensa > 0 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--brand-strong)' }}>
          <Icon name="box" size={13} /> usa {usa_n_despensa} de tu despensa
        </div>
      )}

      {/* Cuadre vs tus pendientes (kcal / proteína) */}
      {(cuadre.kcalPct != null || cuadre.protPct != null) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }} aria-label="Qué tan bien cuadra con tu meta">
          <CuadreBar label="Cierra tus kcal" pct={cuadre.kcalPct} color="var(--brand)" />
          <CuadreBar label="Cierra tu proteína" pct={cuadre.protPct} color="var(--protein)" />
        </div>
      )}

      {onRegister && (
        <div className="c-card__actions">
          <button type="button" className="btn btn-primary" onClick={register} disabled={state !== 'idle'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 'var(--touch)' }}>
            {state === 'saving' ? 'Registrando…' : state === 'done' ? <><Icon name="check" size={15} /> Registrado</> : 'Registrar'}
          </button>
        </div>
      )}
    </div>
  );
}

// Barrita de ajuste. Acepta pct en 0–1 o 0–100.
function CuadreBar({ label, pct, color }) {
  if (pct == null) return null;
  const p = pct <= 1 ? pct * 100 : pct;
  const clamped = Math.max(0, Math.min(100, Math.round(p)));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
      <span className="ring-caption" style={{ minWidth: 118 }}>{label}</span>
      <div role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} aria-label={`${label}: ${clamped}%`} style={{ flex: 1, height: 6, borderRadius: 'var(--r-pill)', background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${clamped}%`, background: color, borderRadius: 'var(--r-pill)', transition: 'width var(--dur-ring) var(--ease-spring)' }} />
      </div>
      <span className="num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', minWidth: 34, textAlign: 'right' }}>{clamped}%</span>
    </div>
  );
}
