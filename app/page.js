'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DailySummary from '@/components/DailySummary';
import WeekChart from '@/components/WeekChart';
import MealList from '@/components/MealList';
import AddMealModal from '@/components/AddMealModal';
import { addDays, dateLabel, localDateStr } from '@/lib/format';
import { downscaleImage } from '@/lib/image';

const EMPTY_TOTALS = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

export default function Home() {
  const [date, setDate] = useState(localDateStr());
  const [goal, setGoal] = useState(2000);
  const [meals, setMeals] = useState([]);
  const [totals, setTotals] = useState(EMPTY_TOTALS);
  const [week, setWeek] = useState([]);
  const [photo, setPhoto] = useState(null); // { url, blob }
  const [pickError, setPickError] = useState('');
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const today = localDateStr();

  const loadDay = useCallback(async (d) => {
    const res = await fetch(`/api/meals?date=${d}`);
    if (!res.ok) return;
    const data = await res.json();
    setMeals(data.meals);
    setTotals(data.totals);
  }, []);

  const loadWeek = useCallback(async (d) => {
    const end = d >= localDateStr() ? d : localDateStr();
    const res = await fetch(`/api/summary?days=7&end=${end}`);
    if (!res.ok) return;
    setWeek((await res.json()).days);
  }, []);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => setGoal(s.calorie_goal))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadDay(date);
    loadWeek(date);
  }, [date, loadDay, loadWeek]);

  const onGoalSave = async (value) => {
    setGoal(value);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calorie_goal: value }),
    }).catch(() => {});
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPickError('');
    try {
      const blob = await downscaleImage(file);
      setPhoto({ url: URL.createObjectURL(blob), blob });
    } catch (err) {
      setPickError(err.message);
    }
  };

  const closeModal = () => {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
  };

  const onSaved = () => {
    closeModal();
    loadDay(date);
    loadWeek(date);
  };

  const onDelete = async (id) => {
    await fetch(`/api/meals/${id}`, { method: 'DELETE' }).catch(() => {});
    loadDay(date);
    loadWeek(date);
  };

  return (
    <main className="container">
      <header className="banner">
        <div className="banner-icon" aria-hidden="true">🍽️</div>
        <div>
          <h1 className="banner-title">Registro Calórico</h1>
          <p className="banner-sub">Tu alimentación, analizada con IA</p>
        </div>
      </header>

      <nav className="date-nav" aria-label="Cambiar día">
        <button type="button" className="nav-btn" aria-label="Día anterior" onClick={() => setDate(addDays(date, -1))}>
          ‹
        </button>
        <span className="date-label">{dateLabel(date)}</span>
        <button
          type="button"
          className="nav-btn"
          aria-label="Día siguiente"
          disabled={date >= today}
          onClick={() => setDate(addDays(date, 1))}
        >
          ›
        </button>
      </nav>

      <DailySummary totals={totals} goal={goal} onGoalSave={onGoalSave} />

      {week.length > 0 && <WeekChart days={week} goal={goal} selectedDate={date} onSelectDay={setDate} />}

      <h2 className="section-title">Platillos del día</h2>
      {pickError && <div className="error-banner">{pickError}</div>}
      <MealList meals={meals} onDelete={onDelete} />

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onPickFile}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onPickFile}
      />
      <div className="fab-row">
        <button type="button" className="btn btn-primary fab" onClick={() => cameraInputRef.current?.click()}>
          📷 Agregar platillo
        </button>
        <button
          type="button"
          className="btn btn-ghost fab-gallery"
          aria-label="Elegir foto de la galería"
          title="Elegir de la galería"
          onClick={() => galleryInputRef.current?.click()}
        >
          🖼️
        </button>
      </div>

      {photo && <AddMealModal photo={photo} date={date} onClose={closeModal} onSaved={onSaved} />}
    </main>
  );
}
