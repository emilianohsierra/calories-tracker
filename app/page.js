'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DailySummary from '@/components/DailySummary';
import WeekChart from '@/components/WeekChart';
import MealList from '@/components/MealList';
import AddMealModal from '@/components/AddMealModal';
import UpgradeModal from '@/components/UpgradeModal';
import CoachTipCard from '@/components/CoachTipCard';
import DayProgress from '@/components/DayProgress';
import GreetingHeader from '@/components/GreetingHeader';
import Icon from '@/components/ui/Icon';
import { addDays, dateLabel, localDateStr } from '@/lib/format';
import { downscaleImage } from '@/lib/image';
import { createClient } from '@/lib/supabase/client';
import { currentPeriod } from '@/lib/usage';

const EMPTY_TOTALS = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

export default function Home() {
  const router = useRouter();
  const [date, setDate] = useState(localDateStr());
  const [goal, setGoal] = useState(2000);
  const [meals, setMeals] = useState([]);
  const [totals, setTotals] = useState(EMPTY_TOTALS);
  const [week, setWeek] = useState([]);
  const [photo, setPhoto] = useState(null); // { url, blob }
  const [pickError, setPickError] = useState('');
  const [usage, setUsage] = useState(null); // { plan, remaining, limit }
  const [showPlans, setShowPlans] = useState(false);
  const [toast, setToast] = useState('');
  const [profile, setProfile] = useState(null); // nutrition_profile (Ola 1)
  const [targets, setTargets] = useState(null); // plan calculado
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const today = localDateStr();

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/usage');
      if (!res.ok) return;
      const data = await res.json();
      setUsage(data);
      // Aviso 80% (una vez por mes, por dispositivo): al llegar a ≤20% del saldo.
      if (data.plan === 'free' && data.limit) {
        const used = data.used ?? data.limit - (data.remaining ?? 0);
        const period = currentPeriod(); // 'YYYY-MM' en America/Mexico_City (m3)
        const flag = `warned80_${period}`;
        if (used >= Math.ceil(data.limit * 0.8) && data.remaining > 0 && !localStorage.getItem(flag)) {
          localStorage.setItem(flag, '1');
          setToast(`Te quedan ${data.remaining} análisis con IA este mes. Con Pro son ilimitados.`);
        }
      }
    } catch {
      // no bloquea la app si falla
    }
  }, []);

  const onLogout = async () => {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  };

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
    // Perfil de nutrición (Ola 1): si existe, HOME muestra el plan del coach.
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setProfile(d.profile);
          setTargets(d.targets);
        }
      })
      .catch(() => {});
    loadUsage();
    // Confirmación post-pago: Stripe regresa con ?upgraded=1.
    if (typeof window !== 'undefined' && window.location.search.includes('upgraded=1')) {
      setToast('¡Ya eres Pro! Analiza sin límites. Gracias por apoyar la app.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loadUsage]);

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
    loadUsage(); // el análisis consume crédito aunque no se guarde
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
      <GreetingHeader
        subtitle="Tu resumen de hoy"
        actions={
          <>
            {usage && (
              <button
                type="button"
                className={`usage-badge${usage.plan === 'free' && (usage.remaining ?? 0) <= 3 ? ' low' : ''}`}
                title="Tu plan y análisis con IA"
                onClick={() => setShowPlans(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {usage.plan === 'pro' ? (
                  <>
                    <Icon name="star" size={14} /> Pro
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" size={14} /> {usage.remaining ?? 0}/{usage.limit ?? 10} análisis IA
                  </>
                )}
              </button>
            )}
            <button type="button" className="link-btn" onClick={onLogout}>
              Salir
            </button>
          </>
        }
      />

      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button type="button" className="link-btn" onClick={() => setToast('')} aria-label="Cerrar aviso" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {profile && targets ? (
        <>
          <button type="button" className="coach-entry" onClick={() => router.push('/coach')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="message" size={18} /> Habla con Mi Coach
            </span>
            <span aria-hidden="true">›</span>
          </button>
          <CoachTipCard coach={profile.coach} />
          <div style={{ textAlign: 'right', margin: '-8px 0 var(--s3)' }}>
            <button type="button" className="link-btn" onClick={() => router.push('/perfil')}>
              Editar mi plan
            </button>
          </div>
        </>
      ) : (
        <section className="plan-cta">
          <p className="tip-body" style={{ marginTop: 0 }}>
            Arma tu plan con el coach: calorías y macros a tu medida en un minuto.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => router.push('/onboarding')}>
            Crear mi plan
          </button>
        </section>
      )}

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

      {profile && targets ? (
        <DayProgress totals={totals} targets={targets} />
      ) : (
        <DailySummary totals={totals} goal={goal} onGoalSave={onGoalSave} />
      )}

      {week.length > 0 && (
        <WeekChart days={week} goal={targets?.kcal_target || goal} selectedDate={date} onSelectDay={setDate} />
      )}

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
        <button
          type="button"
          className="btn btn-primary fab"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Icon name="camera" size={18} /> Agregar platillo
        </button>
        <button
          type="button"
          className="btn btn-ghost fab-gallery"
          aria-label="Elegir foto de la galería"
          title="Elegir de la galería"
          onClick={() => galleryInputRef.current?.click()}
        >
          <Icon name="image" size={20} />
        </button>
      </div>

      {photo && (
        <AddMealModal
          photo={photo}
          date={date}
          usage={usage}
          resetLabel={usage?.resets_on}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}

      {showPlans && <UpgradeModal variant="plans" usage={usage} onClose={() => setShowPlans(false)} />}
    </main>
  );
}
