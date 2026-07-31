'use client';

import { useState } from 'react';
import { fmt } from '@/lib/format';
import Icon from '@/components/ui/Icon';

export default function MealList({ meals, onDelete }) {
  if (meals.length === 0) {
    return (
      <div className="card empty-state">
        Aún no hay platillos registrados este día.
        <br />
        Toma una foto de tu comida para empezar.
      </div>
    );
  }
  return (
    <div>
      {meals.map((meal) => (
        <MealCard key={meal.id} meal={meal} onDelete={onDelete} />
      ))}
    </div>
  );
}

function MealCard({ meal, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <article className="card meal-card">
      {meal.image_url ? (
        <img className="meal-thumb" src={meal.image_url} alt={meal.title} />
      ) : (
        <div className="meal-thumb placeholder" aria-hidden="true" style={{ color: 'var(--text-3)' }}>
          <Icon name="utensils" size={24} />
        </div>
      )}
      <div className="meal-body">
        <h4 className="meal-title">{meal.title}</h4>
        {meal.description && <p className="meal-desc">{meal.description}</p>}
        <div className="meal-meta">
          <span className="chip">{meal.meal_type}</span>
          <span>{meal.time}</span>
          <span className="num">
            P {fmt(meal.protein_g)}g · C {fmt(meal.carbs_g)}g · G {fmt(meal.fat_g)}g
          </span>
        </div>
      </div>
      <div className="meal-right">
        <div className="meal-kcal num">
          {fmt(meal.calories)}
          <span className="unit">kcal</span>
        </div>
        {confirming ? (
          <div style={{ display: 'flex', gap: 2 }}>
            <button type="button" className="icon-btn" style={{ color: 'var(--over)', fontWeight: 600, fontSize: 12 }} onClick={() => onDelete(meal.id)}>
              Borrar
            </button>
            <button type="button" className="icon-btn" style={{ fontSize: 12 }} onClick={() => setConfirming(false)}>
              No
            </button>
          </div>
        ) : (
          <button type="button" className="icon-btn" aria-label={`Eliminar ${meal.title}`} onClick={() => setConfirming(true)}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
    </article>
  );
}
