'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import NivelEvaluacion from '@/components/coach/NivelEvaluacion';
import LeccionQuiz from '@/components/coach/LeccionQuiz';
import RepasoCard from '@/components/coach/RepasoCard';
import { getEducacionUI } from '@/lib/coach/eduClient';
import { useModalA11y } from '@/lib/ui/useModalA11y';

// "Mi aprendizaje": icono discreto en el header del coach → hoja con el MAPA CALMADO por-tema
// (nuevo / aprendiendo / dominado + "listo para reforzar"), la sección de refuerzo (pull, 1 tap),
// recalibración de nivel y ofertas de micro-lección (gate anti-saturación). SIN rojo/alarma/%/
// rachas de estudio. Deploy-safe: si /educacion falla o no trae `temas`, cae al contador.
const LECCIONES = [
  { id: 'proteina', label: 'Por qué la proteína' },
  { id: 'deficit', label: 'Déficit sin pasar hambre' },
  { id: 'calidad_sin_culpa', label: 'Calidad sin culpa' },
];
// Estados calmados (framing positivo, sin alarma).
const ESTADOS = {
  nuevo: { label: 'Nuevo', border: 'var(--text-3)', bg: 'transparent', text: 'var(--text-3)' },
  aprendiendo: { label: 'Aprendiendo', border: 'var(--brand)', bg: 'var(--brand-tint)', text: 'var(--brand-strong)' },
  dominado: { label: 'Dominado', border: 'var(--ok)', bg: 'var(--ok)', text: 'var(--ok)' },
};

export default function MiAprendizaje() {
  const [edu, setEdu] = useState(null); // { nivel, vistos, ofrecer, temas?, repaso? }
  const [open, setOpen] = useState(false);
  const [nivelOpen, setNivelOpen] = useState(false);
  const [leccion, setLeccion] = useState(null);
  const [repasoActivo, setRepasoActivo] = useState(null);

  const cargar = () => { getEducacionUI().then(setEdu); };
  useEffect(() => { cargar(); }, []);

  const sinEvaluar = edu && edu.nivel == null;

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
        <AprendizajePanel
          edu={edu}
          sinEvaluar={sinEvaluar}
          onClose={() => setOpen(false)}
          onRecalibrar={() => setNivelOpen(true)}
          onLeccion={(id) => setLeccion(id)}
          onReforzar={(r) => setRepasoActivo(r)}
        />
      )}

      {nivelOpen && <NivelEvaluacion onClose={() => setNivelOpen(false)} onDone={cargar} />}
      {leccion && <LeccionQuiz concepto={leccion} onClose={() => setLeccion(null)} onDone={cargar} />}
      {repasoActivo && <RepasoCard repaso={repasoActivo} onClose={() => setRepasoActivo(null)} onDone={cargar} />}
    </>
  );
}

function EstadoDot({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.nuevo;
  return (
    <span aria-hidden="true" style={{ position: 'relative', width: 14, height: 14, borderRadius: '50%', border: `2px solid ${e.border}`, background: e.bg, flexShrink: 0, display: 'inline-block' }}>
      {estado === 'aprendiendo' && <span style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: 'var(--brand)' }} />}
    </span>
  );
}

// Panel (hoja) — componente propio → monta al abrir (useModalA11y aplica bien).
function AprendizajePanel({ edu, sinEvaluar, onClose, onRecalibrar, onLeccion, onReforzar }) {
  const modalRef = useModalA11y(onClose);
  const temas = Array.isArray(edu?.temas) ? edu.temas : null;
  const repaso = edu?.repaso || null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Mi aprendizaje" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s4)' }}>
          <h2 style={{ margin: 0, fontSize: 18, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="book" size={18} /> Mi aprendizaje
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ display: 'inline-flex', width: 'var(--touch)', height: 'var(--touch)', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', margin: '-8px -8px 0 0' }}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Listos para reforzar (invitación positiva, pull) — sólo si hay un tema due con su ítem */}
        {(repaso?.item || repaso?.quiz) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', padding: 'var(--s3)', borderRadius: 'var(--r-md)', background: 'var(--brand-tint)', border: '1px solid var(--border)', marginBottom: 'var(--s4)' }}>
            <span style={{ color: 'var(--brand-strong)', flexShrink: 0 }}><Icon name="sparkles" size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Listo para reforzar</div>
              <div className="c-subtitle">{repaso.titulo}</div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => onReforzar(repaso)} style={{ minHeight: 'var(--touch)', padding: '6px 14px' }}>Reforzar</button>
          </div>
        )}

        {/* MAPA por-tema (3 estados calmados) o, si el backend no lo trae, el contador */}
        {temas ? (
          <div style={{ marginBottom: 'var(--s4)' }}>
            <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>Tus temas</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
              {temas.map((t) => {
                const e = ESTADOS[t.estado] || ESTADOS.nuevo;
                return (
                  <div key={t.concepto} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
                    <EstadoDot estado={t.estado} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--text)' }}>{t.titulo}</span>
                    {t.estado === 'dominado' && <span style={{ color: 'var(--ok)', display: 'inline-flex' }} aria-hidden="true"><Icon name="check" size={15} /></span>}
                    <span className="c-subtitle" style={{ color: e.text }}>{t.due ? 'Listo para reforzar' : e.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', padding: 'var(--s3)', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 'var(--s4)' }}>
            <span style={{ color: 'var(--brand-strong)' }}><Icon name="sparkles" size={20} /></span>
            <div>
              <div className="num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{edu?.vistos ?? 0}</div>
              <div className="c-subtitle">{(edu?.vistos ?? 0) === 1 ? 'micro-lección vista' : 'micro-lecciones vistas'}</div>
            </div>
          </div>
        )}

        {/* Recalibrar nivel */}
        <button type="button" className="btn btn-ghost" onClick={onRecalibrar} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 'var(--s4)' }}>
          <Icon name="settings" size={16} /> {sinEvaluar ? 'Personalizar mis explicaciones' : 'Recalibrar mi nivel'}
        </button>

        {/* Oferta de micro-lección — sólo si el backend lo permite (gate anti-saturación) */}
        {edu?.ofrecer && (
          <div>
            <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>Aprende algo en 30 s</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s2)' }}>
              {LECCIONES.map((l) => (
                <button key={l.id} type="button" className="chip-action" onClick={() => onLeccion(l.id)} style={{ gap: 6 }}>
                  <Icon name="book" size={14} /> {l.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
