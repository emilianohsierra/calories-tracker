'use client';

import { useState } from 'react';
import { currentTimeStr } from '@/lib/format';
import UpgradeModal from '@/components/UpgradeModal';
import Icon from '@/components/ui/Icon';

const MEAL_TYPES = ['desayuno', 'comida', 'cena', 'snack'];

const EMPTY_FORM = {
  title: '',
  description: '',
  meal_type: 'comida',
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  ingredients: [],
  confidence: '',
  image: '',
  provider: '',
};

export default function AddMealModal({ photo, date, usage, resetLabel, onClose, onSaved }) {
  const [phase, setPhase] = useState('preview'); // preview | analyzing | edit
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [rawAnalysis, setRawAnalysis] = useState(null);
  const [blocked, setBlocked] = useState(false); // paywall: sin análisis IA disponibles

  // El límite aplica SOLO a la IA. Pro = ilimitado; Free necesita saldo > 0.
  // (M2) Si la cuota no cargó (usage null), NO bloquear: se permite el intento y el
  // servidor (429) decide. Así no hay paywall falso para Free-con-saldo ni Pro.
  const canAnalyze = !usage || usage.plan === 'pro' || (usage.remaining ?? 0) > 0;
  const isPro = usage?.plan === 'pro';

  const onAnalyzeClick = () => {
    if (canAnalyze) runAnalysis();
    else setBlocked(true); // gate ANTES de llamar a la IA (no gasta la llamada)
  };

  // Modo manual (gratis e ilimitado): formulario vacío, sin llamar a la IA.
  const enterManual = () => {
    setBlocked(false);
    setRawAnalysis(null);
    setForm({ ...EMPTY_FORM, time: currentTimeStr() });
    setPhase('edit');
  };

  const runAnalysis = async (correction = null, fallbackPhase = 'preview') => {
    setPhase('analyzing');
    setError('');
    try {
      const fd = new FormData();
      fd.append('image', photo.blob, 'platillo.jpg');
      if (hint.trim()) fd.append('hint', hint.trim());
      if (correction) {
        fd.append('feedback', correction.feedback);
        const { imagen, proveedor, ...previous } = correction.previous;
        fd.append('previous', JSON.stringify(previous));
        if (imagen) fd.append('reuse', imagen);
      }
      const res = await fetch('/api/analyze', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo analizar la imagen');
      setRawAnalysis(data);
      setForm((prev) => ({
        title: data.titulo,
        description: data.descripcion,
        meal_type: MEAL_TYPES.includes(data.tipo_comida) ? data.tipo_comida : 'comida',
        time: prev?.time || currentTimeStr(),
        calories: data.calorias,
        protein_g: data.proteinas_g,
        carbs_g: data.carbohidratos_g,
        fat_g: data.grasas_g,
        ingredients: data.ingredientes || [],
        confidence: data.confianza,
        image: data.imagen,
        provider: data.proveedor || '',
      }));
      setFeedback('');
      setPhase('edit');
    } catch (err) {
      setError(err.message);
      setPhase(fallbackPhase);
    }
  };

  const reanalyze = () => {
    if (!feedback.trim() || !rawAnalysis) return;
    runAnalysis({ feedback: feedback.trim(), previous: rawAnalysis }, 'edit');
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Agregar platillo">
        <h2>Agregar platillo</h2>
        <img className="preview-img" src={photo.url} alt="Foto del platillo" />

        {error && <div className="error-banner">{error}</div>}

        {phase === 'preview' && (
          <div className="form-grid">
            <div className="field">
              <label htmlFor="hint">Nota para la IA (opcional)</label>
              <input
                id="hint"
                type="text"
                placeholder="ej. son 2 tacos de pastor con todo"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                maxLength={300}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancelar
              </button>
              <button type="button" className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={enterManual}>
                <Icon name="pencil" size={16} /> A mano
              </button>
              <button type="button" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onAnalyzeClick}>
                <Icon name="sparkles" size={16} /> Analizar con IA
              </button>
            </div>
            {usage?.plan === 'free' && (
              <p className="confidence-note">
                Te quedan {usage.remaining ?? 0} análisis con IA este mes. El registro a mano es gratis.
              </p>
            )}
          </div>
        )}

        {phase === 'analyzing' && (
          <div className="analyzing">
            <div className="spinner" aria-hidden="true" />
            <span>Analizando tu platillo con IA…</span>
          </div>
        )}

        {phase === 'edit' && form && (
          <form className="form-grid" onSubmit={save}>
            <div className="field">
              <label htmlFor="title">Título</label>
              <input id="title" type="text" required maxLength={120} value={form.title} onChange={set('title')} />
            </div>
            <div className="field">
              <label htmlFor="description">Descripción</label>
              <textarea id="description" maxLength={600} value={form.description} onChange={set('description')} />
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="meal_type">Tipo</label>
                <select id="meal_type" value={form.meal_type} onChange={set('meal_type')}>
                  {MEAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="time">Hora</label>
                <input id="time" type="time" required value={form.time} onChange={set('time')} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="calories">Calorías (kcal)</label>
                <input id="calories" type="number" min="0" max="10000" required value={form.calories} onChange={set('calories')} />
              </div>
              <div className="field">
                <label htmlFor="protein_g">Proteína (g)</label>
                <input id="protein_g" type="number" min="0" step="0.1" value={form.protein_g} onChange={set('protein_g')} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="carbs_g">Carbohidratos (g)</label>
                <input id="carbs_g" type="number" min="0" step="0.1" value={form.carbs_g} onChange={set('carbs_g')} />
              </div>
              <div className="field">
                <label htmlFor="fat_g">Grasas (g)</label>
                <input id="fat_g" type="number" min="0" step="0.1" value={form.fat_g} onChange={set('fat_g')} />
              </div>
            </div>

            {form.ingredients.length > 0 && (
              <div className="field">
                <label>Ingredientes detectados</label>
                <div className="ingredient-chips">
                  {form.ingredients.map((ing) => (
                    <span key={ing} className="chip">
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {form.confidence && (
              <p className="confidence-note">
                {form.provider ? `Analizado con ${form.provider} · ` : ''}Confianza de la estimación:{' '}
                <strong>{form.confidence}</strong>. Puedes ajustar los valores antes de guardar.
              </p>
            )}

            {isPro && rawAnalysis && (
            <div className="field feedback-box">
              <label htmlFor="feedback">¿La IA se equivocó? Corrígela y vuelve a analizar</label>
              <div className="feedback-row">
                <input
                  id="feedback"
                  type="text"
                  placeholder="ej. el plato de vegetales no existe"
                  value={feedback}
                  maxLength={400}
                  onChange={(e) => setFeedback(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      reanalyze();
                    }
                  }}
                />
                <button type="button" className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} disabled={!feedback.trim()} onClick={reanalyze}>
                  <Icon name="refresh" size={16} /> Reanalizar
                </button>
              </div>
            </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar platillo'}
              </button>
            </div>
          </form>
        )}
      </div>

      {blocked && (
        <UpgradeModal
          variant="limit"
          usage={usage}
          resetLabel={resetLabel}
          onManual={enterManual}
          onClose={() => setBlocked(false)}
        />
      )}
    </div>
  );
}
