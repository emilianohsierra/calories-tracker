'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProgressRing from '@/components/ProgressRing';
import PlanDiff from '@/components/PlanDiff';

// Editar perfil/plan: formulario PRE-LLENADO con los valores actuales. Al guardar,
// reusa POST /api/profile (que recomputa los targets con computeTargets). Aditivo.
const COACHES = [
  { id: 'perdida_grasa', label: 'Perder grasa' },
  { id: 'hipertrofia', label: 'Ganar músculo' },
  { id: 'runner', label: 'Correr / resistencia' },
  { id: 'bienestar', label: 'Comer más sano' },
  { id: 'recomposicion', label: 'Recomposición' },
];
const ACTIVITY = [
  { key: 1.2, label: 'Sedentario' },
  { key: 1.375, label: 'Ligero (1–3/sem)' },
  { key: 1.55, label: 'Moderado (3–5/sem)' },
  { key: 1.725, label: 'Alto (6–7/sem)' },
  { key: 1.9, label: 'Muy alto' },
];

export default function PerfilPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [targets, setTargets] = useState(null);
  const [prevTargets, setPrevTargets] = useState(null);
  const [f, setF] = useState(null); // formulario

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.profile) {
          // Sin perfil aún → mandar al onboarding.
          router.replace('/onboarding');
          return;
        }
        const p = d.profile;
        const cp = p.coach_params || {};
        setF({
          coach: p.coach,
          sex: p.sex,
          age: String(p.age ?? ''),
          height: String(p.height_cm ?? ''),
          weight: String(p.weight_kg ?? ''),
          pal: Number(p.activity_pal) || 1.375,
          bodyFat: p.body_fat_pct != null ? String(p.body_fat_pct) : '',
          ritmo: cp.ritmo || 'moderado',
          experiencia: cp.experiencia || 'novato',
          km_semana: cp.km_semana != null ? String(cp.km_semana) : '20',
        });
        setTargets(d.targets);
        setLoading(false);
      })
      .catch(() => {
        setError('No se pudo cargar tu perfil.');
        setLoading(false);
      });
  }, [router]);

  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setBusy(true);
    setError('');
    const coach_params = {};
    if (f.coach === 'perdida_grasa') coach_params.ritmo = f.ritmo;
    if (f.coach === 'hipertrofia') coach_params.experiencia = f.experiencia;
    if (f.coach === 'runner') coach_params.km_semana = Number(f.km_semana) || 0;
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coach: f.coach,
          sex: f.sex,
          age: Number(f.age),
          height_cm: Number(f.height),
          weight_kg: Number(f.weight),
          activity_pal: f.pal,
          coach_params,
          ...(f.bodyFat ? { body_fat_pct: Number(f.bodyFat) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ? `${data.error} — ${data.detail}` : data.error || 'No se pudo guardar');
      setPrevTargets(data.targets_prev);
      setTargets(data.targets);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="wizard">
        <p className="wizard-help">Cargando tu perfil…</p>
      </main>
    );
  }
  if (!f) {
    // GET falló (M-R1): no dejar "Cargando…" infinito; mostrar error + salida.
    return (
      <main className="wizard">
        <div className="error-banner">{error || 'No se pudo cargar tu perfil.'}</div>
        <div className="wizard-nav">
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => router.push('/')}>
            Volver al inicio
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="wizard">
      <h1 className="wizard-title">Editar mi plan</h1>
      <p className="wizard-help">Cambia tu objetivo o tus datos; recalculamos tu plan al guardar.</p>
      {error && <div className="error-banner">{error}</div>}
      {saved && (
        <>
          <div className="toast" role="status"><span>Plan actualizado ✔</span></div>
          <PlanDiff prev={prevTargets} next={targets} />
        </>
      )}

      <div className="field-row">
        <label>Objetivo (coach)</label>
        <div className="goal-grid">
          {COACHES.map((c) => (
            <button key={c.id} type="button" className="goal-card" aria-pressed={f.coach === c.id} onClick={() => set('coach')(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field-row">
        <label>Sexo biológico</label>
        <div className="segmented">
          <button type="button" aria-pressed={f.sex === 'female'} onClick={() => set('sex')('female')}>Mujer</button>
          <button type="button" aria-pressed={f.sex === 'male'} onClick={() => set('sex')('male')}>Hombre</button>
        </div>
      </div>

      <div className="field-row">
        <label htmlFor="age">Edad</label>
        <input id="age" type="number" inputMode="numeric" min="14" max="100" value={f.age} onChange={(e) => set('age')(e.target.value)} />
      </div>
      <div className="field-row">
        <label htmlFor="height">Altura (cm)</label>
        <input id="height" type="number" inputMode="numeric" min="100" max="250" value={f.height} onChange={(e) => set('height')(e.target.value)} />
      </div>
      <div className="field-row">
        <label htmlFor="weight">Peso (kg)</label>
        <input id="weight" type="number" inputMode="decimal" min="30" max="300" value={f.weight} onChange={(e) => set('weight')(e.target.value)} />
      </div>
      <div className="field-row">
        <label htmlFor="pal">Nivel de actividad</label>
        <select id="pal" value={f.pal} onChange={(e) => set('pal')(Number(e.target.value))}>
          {ACTIVITY.map((a) => (
            <option key={a.key} value={a.key}>{a.label}</option>
          ))}
        </select>
      </div>

      {f.coach === 'perdida_grasa' && (
        <div className="field-row">
          <label>Ritmo de pérdida</label>
          <div className="segmented">
            <button type="button" aria-pressed={f.ritmo === 'conservador'} onClick={() => set('ritmo')('conservador')}>Suave</button>
            <button type="button" aria-pressed={f.ritmo === 'moderado'} onClick={() => set('ritmo')('moderado')}>Moderado</button>
          </div>
        </div>
      )}
      {f.coach === 'hipertrofia' && (
        <div className="field-row">
          <label>Experiencia</label>
          <div className="segmented">
            {['novato', 'intermedio', 'avanzado'].map((e) => (
              <button key={e} type="button" aria-pressed={f.experiencia === e} onClick={() => set('experiencia')(e)}>
                {e[0].toUpperCase() + e.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
      {f.coach === 'runner' && (
        <div className="field-row">
          <label htmlFor="km">Kilómetros por semana</label>
          <input id="km" type="number" inputMode="numeric" min="0" max="250" value={f.km_semana} onChange={(e) => set('km_semana')(e.target.value)} />
        </div>
      )}
      {f.coach === 'recomposicion' && (
        <div className="field-row">
          <label htmlFor="bf">% de grasa corporal (opcional)</label>
          <input id="bf" type="number" inputMode="decimal" min="3" max="60" value={f.bodyFat} onChange={(e) => set('bodyFat')(e.target.value)} />
        </div>
      )}

      {targets && (
        <section className="reveal" style={{ margin: 'var(--s5) 0' }}>
          <ProgressRing value={1} goal={1} size={150} stroke={14} color="var(--brand)">
            <span className="num reveal-kcal" style={{ fontSize: 34 }}>{targets.kcal_target}</span>
            <span className="ring-caption">kcal / día</span>
          </ProgressRing>
          <div className="mini-rings" style={{ justifyContent: 'center', marginTop: 'var(--s3)' }}>
            <span className="ring-caption">P <b className="num">{targets.protein_g}g</b></span>
            <span className="ring-caption">C <b className="num">{targets.carbs_g}g</b></span>
            <span className="ring-caption">G <b className="num">{targets.fat_g}g</b></span>
          </div>
        </section>
      )}

      <div className="wizard-nav">
        <button type="button" className="btn btn-ghost" onClick={() => router.push('/')} disabled={busy}>
          Volver
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar y recalcular'}
        </button>
      </div>
    </main>
  );
}
