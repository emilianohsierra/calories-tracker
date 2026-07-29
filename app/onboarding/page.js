'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ProgressRing from '@/components/ProgressRing';

const COACHES = [
  { id: 'perdida_grasa', label: 'Perder grasa', desc: 'Bajar grasa sin perder músculo' },
  { id: 'hipertrofia', label: 'Ganar músculo', desc: 'Crecer con superávit limpio' },
  { id: 'runner', label: 'Correr / resistencia', desc: 'Rendir y recuperar mejor' },
  { id: 'bienestar', label: 'Comer más sano', desc: 'Hábitos y mantenimiento' },
];
const ACTIVITY = [
  { key: 1.2, label: 'Sedentario', desc: 'Poco o nada de ejercicio' },
  { key: 1.375, label: 'Ligero', desc: '1–3 entrenos/semana' },
  { key: 1.55, label: 'Moderado', desc: '3–5 entrenos/semana' },
  { key: 1.725, label: 'Alto', desc: '6–7 entrenos/semana' },
  { key: 1.9, label: 'Muy alto', desc: '2 sesiones/día' },
];
const TOTAL = 6;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [coach, setCoach] = useState('');
  const [sex, setSex] = useState('female');
  const [age, setAge] = useState('30');
  const [height, setHeight] = useState('170');
  const [weight, setWeight] = useState('70');
  const [pal, setPal] = useState(1.375);
  const [cp, setCp] = useState({ ritmo: 'moderado', experiencia: 'novato', km_semana: '20' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [targets, setTargets] = useState(null);

  const setParam = (k, v) => setCp((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError('');
    setStep(5); // "calculando"
    // Solo enviamos los coach_params relevantes al coach elegido.
    const coach_params = {};
    if (coach === 'perdida_grasa') coach_params.ritmo = cp.ritmo;
    if (coach === 'hipertrofia') coach_params.experiencia = cp.experiencia;
    if (coach === 'runner') coach_params.km_semana = Number(cp.km_semana) || 0;
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sex,
          age: Number(age),
          height_cm: Number(height),
          weight_kg: Number(weight),
          activity_pal: pal, // ya es uno de los 5 niveles válidos (1.2–1.9)
          coach,
          coach_params,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo calcular tu plan');
      setTargets(data.targets);
      setStep(6);
    } catch (err) {
      setError(err.message);
      setStep(4);
    } finally {
      setBusy(false);
    }
  };

  const canNext =
    (step === 1) ||
    (step === 2 && coach) ||
    (step === 3 && age && height && weight) ||
    step === 4;

  return (
    <main className="wizard">
      <div className="wizard-progress" aria-hidden="true">
        <span style={{ width: `${(Math.min(step, TOTAL) / TOTAL) * 100}%` }} />
      </div>

      <div className="wizard-step">
        {step === 1 && (
          <div>
            <h1 className="wizard-title">Tu coach de nutrición, en español</h1>
            <p className="wizard-help">
              Te armamos un plan a tu medida en un minuto: calorías, macros y un consejo diario. Sin dietas de castigo.
            </p>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1 className="wizard-title">¿Qué buscas?</h1>
            <p className="wizard-help">Elige tu objetivo principal. Podrás cambiarlo después.</p>
            <div className="goal-grid">
              {COACHES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="goal-card"
                  aria-pressed={coach === c.id}
                  onClick={() => setCoach(c.id)}
                >
                  {c.label}
                  <small>{c.desc}</small>
                </button>
              ))}
            </div>
            <button type="button" className="goal-card" disabled style={{ marginTop: 'var(--s3)', width: '100%' }}>
              Objetivos médicos
              <small>Próximamente (con validación profesional)</small>
            </button>
          </div>
        )}

        {step === 3 && (
          <div>
            <h1 className="wizard-title">Tus datos</h1>
            <p className="wizard-help">Con esto calculamos tu gasto energético.</p>
            <div className="field-row">
              <label>Sexo biológico</label>
              <div className="segmented">
                <button type="button" aria-pressed={sex === 'female'} onClick={() => setSex('female')}>
                  Mujer
                </button>
                <button type="button" aria-pressed={sex === 'male'} onClick={() => setSex('male')}>
                  Hombre
                </button>
              </div>
            </div>
            <div className="field-row">
              <label htmlFor="age">Edad</label>
              <input id="age" type="number" inputMode="numeric" min="14" max="100" value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div className="field-row">
              <label htmlFor="height">Altura (cm)</label>
              <input id="height" type="number" inputMode="numeric" min="100" max="250" value={height} onChange={(e) => setHeight(e.target.value)} />
            </div>
            <div className="field-row">
              <label htmlFor="weight">Peso (kg)</label>
              <input id="weight" type="number" inputMode="decimal" min="30" max="300" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div className="field-row">
              <label htmlFor="pal">Nivel de actividad</label>
              <select id="pal" value={pal} onChange={(e) => setPal(Number(e.target.value))}>
                {ACTIVITY.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label} — {a.desc}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h1 className="wizard-title">Afinamos tu plan</h1>
            {error && <div className="error-banner">{error}</div>}
            {coach === 'perdida_grasa' && (
              <div className="field-row">
                <label>Ritmo de pérdida</label>
                <div className="segmented">
                  <button type="button" aria-pressed={cp.ritmo === 'conservador'} onClick={() => setParam('ritmo', 'conservador')}>
                    Suave
                  </button>
                  <button type="button" aria-pressed={cp.ritmo === 'moderado'} onClick={() => setParam('ritmo', 'moderado')}>
                    Moderado
                  </button>
                </div>
              </div>
            )}
            {coach === 'hipertrofia' && (
              <div className="field-row">
                <label>Experiencia entrenando</label>
                <div className="segmented">
                  {['novato', 'intermedio', 'avanzado'].map((e) => (
                    <button key={e} type="button" aria-pressed={cp.experiencia === e} onClick={() => setParam('experiencia', e)}>
                      {e[0].toUpperCase() + e.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {coach === 'runner' && (
              <div className="field-row">
                <label htmlFor="km">Kilómetros por semana</label>
                <input id="km" type="number" inputMode="numeric" min="0" max="250" value={cp.km_semana} onChange={(e) => setParam('km_semana', e.target.value)} />
              </div>
            )}
            {coach === 'bienestar' && <p className="wizard-help">Listo. Tu plan será de mantenimiento con foco en hábitos.</p>}
          </div>
        )}

        {step === 5 && (
          <div className="reveal">
            <ProgressRing value={70} goal={100} size={140} stroke={12} color="var(--brand)">
              <span className="ring-caption">Calculando…</span>
            </ProgressRing>
            <p className="wizard-help" style={{ marginTop: 'var(--s4)' }}>Ajustando tus macros a tu objetivo…</p>
          </div>
        )}

        {step === 6 && targets && (
          <div className="reveal">
            <h1 className="wizard-title">Tu plan está listo 🎉</h1>
            <ProgressRing value={1} goal={1} size={180} stroke={16} color="var(--brand)">
              <span className="num reveal-kcal">{targets.kcal_target}</span>
              <span className="ring-caption">kcal / día</span>
            </ProgressRing>
            <div className="mini-rings" style={{ justifyContent: 'center', marginTop: 'var(--s4)' }}>
              <div className="ring-caption">Proteína <b className="num">{targets.protein_g}g</b></div>
              <div className="ring-caption">Carbos <b className="num">{targets.carbs_g}g</b></div>
              <div className="ring-caption">Grasa <b className="num">{targets.fat_g}g</b></div>
            </div>
            <p className="wizard-help" style={{ marginTop: 'var(--s4)' }}>
              Fibra {targets.fiber_g}g · Agua {Math.round(targets.water_ml / 100) / 10} L al día
            </p>
            <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--s5)' }} onClick={() => router.replace('/')}>
              Registrar mi primera comida
            </button>
          </div>
        )}
      </div>

      {step <= 4 && (
        <div className="wizard-nav">
          {step > 1 && (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={busy}>
              Atrás
            </button>
          )}
          {step < 4 && (
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={!canNext} onClick={() => setStep(step + 1)}>
              Continuar
            </button>
          )}
          {step === 4 && (
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={submit}>
              {busy ? 'Calculando…' : 'Ver mi plan'}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
