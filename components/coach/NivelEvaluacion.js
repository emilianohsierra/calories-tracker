'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { getNivelPreguntas, postNivel } from '@/lib/coach/eduClient';
import { useModalA11y } from '@/lib/ui/useModalA11y';

// A) Evaluación de nivel: breve, SALTABLE (sin penalización), no intrusiva. El nivel es INVISIBLE
// (no se muestra crudo); la UI solo confirma "listo". Recalibrable. Todo del backend determinista.
// Auto-selección amistosa (sin jerga) o "pregúntame" (respuestas abiertas con 'No sé'). Deploy-safe.
const AUTO_LABEL = {
  principiante: 'Soy nuevo en esto',
  basico: 'Sé lo básico',
  intermedio: 'Sé bastante',
  avanzado: 'Sé mucho',
};

export default function NivelEvaluacion({ onClose, onDone }) {
  const modalRef = useModalA11y(onClose);
  const [preguntas, setPreguntas] = useState(null);
  const [fase, setFase] = useState('intro'); // intro | preguntas | guardando | listo | error
  const [respuestas, setRespuestas] = useState({}); // { [id]: texto }

  useEffect(() => {
    getNivelPreguntas().then((d) => setPreguntas(Array.isArray(d?.preguntas) ? d.preguntas : []));
  }, []);

  const finalizar = (r) => {
    if (!r || r._error) { setFase('error'); return; }
    setFase('listo');
    onDone?.(); // refresca el contador / estado del hub
    setTimeout(() => onClose(), 1600); // M3: margen para que el lector anuncie el role=status
  };

  const elegirAuto = async (id) => { setFase('guardando'); finalizar(await postNivel({ autoSelect: id })); };
  const saltar = async () => { await postNivel({ skip: true }); onClose(); };
  const enviarRespuestas = async () => {
    setFase('guardando');
    const arr = (preguntas || []).map((p) => ({ id: p.id, texto: respuestas[p.id] || '' }));
    finalizar(await postNivel({ respuestas: arr }));
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Personalizar explicaciones" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s3)' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Ajusta tus explicaciones</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ display: 'inline-flex', width: 'var(--touch)', height: 'var(--touch)', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', margin: '-8px -8px 0 0' }}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {fase === 'listo' ? (
          <div className="empty-state" role="status" style={{ padding: 'var(--s5) var(--s4)' }}>
            <div style={{ color: 'var(--brand-strong)', marginBottom: 'var(--s2)' }}><Icon name="check" size={26} /></div>
            Listo. Ajusté cómo te explico las cosas.
          </div>
        ) : fase === 'error' ? (
          <p className="c-subtitle" role="alert">No pude guardar ahora, pero puedes seguir usando el coach normal.</p>
        ) : fase === 'preguntas' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
            {(preguntas || []).map((p) => (
              <div className="field" key={p.id}>
                <label htmlFor={`nv-${p.id}`}>{p.pregunta}</label>
                <textarea id={`nv-${p.id}`} rows={2} value={respuestas[p.id] || ''} onChange={(e) => setRespuestas((s) => ({ ...s, [p.id]: e.target.value }))} placeholder="Con tus palabras…" style={{ resize: 'vertical' }} />
                <button type="button" className="link-btn" onClick={() => setRespuestas((s) => ({ ...s, [p.id]: '' }))} style={{ alignSelf: 'flex-start' }}>No sé</button>
              </div>
            ))}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={saltar}>Saltar</button>
              <button type="button" className="btn btn-primary" onClick={enviarRespuestas} disabled={fase === 'guardando'}>
                {fase === 'guardando' ? 'Guardando…' : 'Listo'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
            <p className="c-body" style={{ margin: 0, color: 'var(--text-2)' }}>
              Para explicarte las cosas ni de más ni de menos. Es rápido y puedes saltarlo.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s2)' }}>
              {Object.keys(AUTO_LABEL).map((id) => (
                <button key={id} type="button" className="chip-action" onClick={() => elegirAuto(id)} disabled={fase === 'guardando'}>
                  {AUTO_LABEL[id]}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setFase('preguntas')} disabled={fase === 'guardando'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="message" size={16} /> No estoy seguro — pregúntame
            </button>
            <button type="button" className="link-btn" onClick={saltar} style={{ alignSelf: 'center' }}>Ahora no</button>
          </div>
        )}
      </div>
    </div>
  );
}
