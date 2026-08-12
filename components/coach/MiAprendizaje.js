'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import NivelEvaluacion from '@/components/coach/NivelEvaluacion';
import LeccionQuiz from '@/components/coach/LeccionQuiz';
import { getEducacion } from '@/lib/coach/eduClient';

// D) "Mi aprendizaje": icono discreto en el header del coach → hoja con el CONTADOR de progreso,
// recalibración de nivel (A) y oferta de micro-lección (C, sólo si el backend dice `ofrecer` —
// gate anti-saturación). Un punto sutil en el icono cuando aún no evaluaste (oferta al inicio,
// no intrusiva). Deploy-safe: si /educacion falla, el icono sigue y la hoja degrada.
const LECCIONES = [
  { id: 'proteina', label: 'Por qué la proteína' },
  { id: 'deficit', label: 'Déficit sin pasar hambre' },
  { id: 'calidad_sin_culpa', label: 'Calidad sin culpa' },
];

export default function MiAprendizaje() {
  const [edu, setEdu] = useState(null); // { nivel, vistos, ofrecer }
  const [open, setOpen] = useState(false);
  const [nivelOpen, setNivelOpen] = useState(false);
  const [leccion, setLeccion] = useState(null); // concepto activo

  const cargar = () => { getEducacion().then(setEdu); };
  useEffect(() => { cargar(); }, []);

  const sinEvaluar = edu && edu.nivel == null; // punto de "ofrecer al inicio"

  return (
    <>
      <button
        type="button"
        className="link-btn"
        onClick={() => { setOpen(true); cargar(); }}
        aria-label="Mi aprendizaje"
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 'var(--touch)', minHeight: 'var(--touch)', color: 'var(--text-2)' }}
      >
        <Icon name="book" size={20} />
        {sinEvaluar && (
          <span aria-hidden="true" style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)' }} />
        )}
      </button>

      {open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Mi aprendizaje" style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s4)' }}>
              <h2 style={{ margin: 0, fontSize: 18, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name="book" size={18} /> Mi aprendizaje
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" style={{ display: 'inline-flex', width: 'var(--touch)', height: 'var(--touch)', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', margin: '-8px -8px 0 0' }}>
                <Icon name="close" size={20} />
              </button>
            </div>

            {/* Contador (D) — solo datos del backend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', padding: 'var(--s3)', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 'var(--s4)' }}>
              <span style={{ color: 'var(--brand-strong)' }}><Icon name="sparkles" size={20} /></span>
              <div>
                <div className="num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{edu?.vistos ?? 0}</div>
                <div className="c-subtitle">{(edu?.vistos ?? 0) === 1 ? 'micro-lección vista' : 'micro-lecciones vistas'}</div>
              </div>
            </div>

            {/* Recalibrar nivel (A) */}
            <button type="button" className="btn btn-ghost" onClick={() => setNivelOpen(true)} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 'var(--s4)' }}>
              <Icon name="settings" size={16} /> {sinEvaluar ? 'Personalizar mis explicaciones' : 'Recalibrar mi nivel'}
            </button>

            {/* Oferta de micro-lección (C) — sólo si el backend lo permite (gate anti-saturación) */}
            {edu?.ofrecer && (
              <div>
                <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>Aprende algo en 30 s</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s2)' }}>
                  {LECCIONES.map((l) => (
                    <button key={l.id} type="button" className="chip-action" onClick={() => setLeccion(l.id)} style={{ gap: 6 }}>
                      <Icon name="book" size={14} /> {l.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {nivelOpen && <NivelEvaluacion onClose={() => setNivelOpen(false)} onDone={cargar} />}
      {leccion && <LeccionQuiz concepto={leccion} onClose={() => setLeccion(null)} onDone={cargar} />}
    </>
  );
}
