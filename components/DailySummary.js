'use client';

import { useState } from 'react';
import { fmt } from '@/lib/format';
import Icon from '@/components/ui/Icon';

const METER_STATES = {
  ok: { fill: 'var(--brand)', track: 'var(--brand-tint)' },
  warn: { fill: 'var(--warn-c)', track: 'var(--warn-tint)' },
  over: { fill: 'var(--over)', track: 'var(--over-tint)' },
};

export default function DailySummary({ totals, goal, onGoalSave }) {
  const [editing, setEditing] = useState(false);
  const [goalInput, setGoalInput] = useState(goal);

  const consumed = totals.calories;
  const ratio = goal > 0 ? consumed / goal : 0;
  const state = ratio > 1 ? 'over' : ratio >= 0.9 ? 'warn' : 'ok';
  const { fill, track } = METER_STATES[state];
  const remaining = goal - consumed;

  const submitGoal = (e) => {
    e.preventDefault();
    const value = Math.round(Number(goalInput));
    if (Number.isFinite(value) && value >= 500 && value <= 10000) {
      onGoalSave(value);
      setEditing(false);
    }
  };

  return (
    <section className="card" aria-label="Resumen del día">
      <div>
        <span className="hero-value num">{fmt(consumed)}</span>
        <span className="hero-unit">kcal</span>
      </div>
      <div className="hero-sub">
        {editing ? (
          <form className="goal-form" onSubmit={submitGoal}>
            <span>Meta diaria:</span>
            <input
              type="number"
              min="500"
              max="10000"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '4px 12px' }}>
              Guardar
            </button>
          </form>
        ) : (
          <>
            de {fmt(goal)} kcal
            <button
              type="button"
              className="goal-edit-btn"
              onClick={() => {
                setGoalInput(goal);
                setEditing(true);
              }}
            >
              Editar meta
            </button>
          </>
        )}
      </div>

      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={consumed} style={{ background: track }}>
        <div className="meter-fill" style={{ width: `${Math.min(ratio, 1) * 100}%`, background: fill }} />
      </div>
      <div className="meter-status">
        {state === 'ok' && (
          <>
            <span className="status-icon" style={{ color: 'var(--ok)', display: 'inline-flex' }}>
              <Icon name="check" size={15} />
            </span>
            <span>Vas bien: te quedan {fmt(remaining)} kcal</span>
          </>
        )}
        {state === 'warn' && (
          <>
            <span className="status-icon" style={{ color: 'var(--warn-c)', display: 'inline-flex' }}>
              <Icon name="info" size={15} />
            </span>
            <span>Cerca de tu meta: te quedan {fmt(Math.max(remaining, 0))} kcal</span>
          </>
        )}
        {state === 'over' && (
          <>
            <span className="status-icon" style={{ color: 'var(--over)', display: 'inline-flex' }}>
              <Icon name="info" size={15} />
            </span>
            <span style={{ color: 'var(--over)' }}>Meta excedida por {fmt(consumed - goal)} kcal</span>
          </>
        )}
      </div>

      <div className="macro-row">
        <Tile label="Proteína" value={totals.protein_g} />
        <Tile label="Carbohidratos" value={totals.carbs_g} />
        <Tile label="Grasas" value={totals.fat_g} />
      </div>
    </section>
  );
}

function Tile({ label, value }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value num">
        {fmt(value)}
        <span className="unit">g</span>
      </div>
    </div>
  );
}
