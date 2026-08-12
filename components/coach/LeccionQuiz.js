'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { postLeccion, postQuiz } from '@/lib/coach/eduClient';

// Tarjeta de micro-lección + quiz de 1 pregunta (C). Contenido y quiz vienen del backend
// determinista (POST /educacion accion:'leccion'). El quiz registra avance (accion:'quiz').
// Deploy-safe: si falla → mensaje suave y cierre. Respeta el gate: sólo se ABRE si el usuario lo pide.
export default function LeccionQuiz({ concepto, onClose, onDone }) {
  const [fase, setFase] = useState('cargando'); // cargando | leccion | pro | error
  const [lec, setLec] = useState(null);          // { titulo, cuerpo, quiz }
  const [elegida, setElegida] = useState(null);  // índice elegido en el quiz
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    let vivo = true;
    postLeccion(concepto).then((r) => {
      if (!vivo) return;
      if (!r || r._error) { setFase('error'); return; }
      if (r.pro) { setLec({ mensaje: r.mensaje }); setFase('pro'); return; }
      if (!r.titulo || !r.quiz) { setFase('error'); return; }
      setLec(r);
      setFase('leccion');
      onDone?.(); // marca 'visto' del lado backend ya ocurrió; refresca el contador
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepto]);

  const responder = (idx) => {
    if (elegida != null) return; // ya respondió
    setElegida(idx);
    const correcto = idx === lec.quiz.correcta;
    postQuiz(concepto, correcto).then(() => setGuardado(true)).catch(() => {});
  };

  const q = lec?.quiz;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Micro-lección" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s3)' }}>
          <h2 style={{ margin: 0, fontSize: 18, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="book" size={18} /> Aprende en 30 s
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ display: 'inline-flex', width: 'var(--touch)', height: 'var(--touch)', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', margin: '-8px -8px 0 0' }}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {fase === 'cargando' && <p className="c-subtitle" aria-live="polite" style={{ textAlign: 'center' }}>Preparando…</p>}
        {fase === 'error' && <p className="c-subtitle" role="alert">No pude cargar la lección ahora. Inténtalo más tarde.</p>}
        {fase === 'pro' && (
          <div className="empty-state" style={{ padding: 'var(--s5) var(--s4)' }}>
            <div style={{ color: 'var(--brand-strong)', marginBottom: 'var(--s2)' }}><Icon name="sparkles" size={24} /></div>
            {lec?.mensaje || 'Ya viste tus micro-lecciones gratis.'}
          </div>
        )}

        {fase === 'leccion' && lec && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
            <div>
              <div className="c-title">{lec.titulo}</div>
              <p className="c-body" style={{ marginTop: 'var(--s2)', color: 'var(--text)' }}>{lec.cuerpo}</p>
            </div>

            {q && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--s4)' }}>
                <div className="c-subtitle" style={{ marginBottom: 'var(--s2)' }}>{q.pregunta}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
                  {q.opciones.map((op, idx) => {
                    const esCorrecta = idx === q.correcta;
                    const elegidaEsta = elegida === idx;
                    const respondido = elegida != null;
                    const borde = respondido && esCorrecta ? 'var(--ok)' : respondido && elegidaEsta ? 'var(--over)' : 'var(--border)';
                    const fondo = respondido && esCorrecta ? 'var(--ok-tint)' : respondido && elegidaEsta ? 'var(--over-tint)' : 'var(--surface)';
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => responder(idx)}
                        disabled={respondido}
                        aria-pressed={elegidaEsta}
                        style={{ textAlign: 'left', padding: 'var(--s3)', minHeight: 'var(--touch)', borderRadius: 'var(--r-md)', border: `1px solid ${borde}`, background: fondo, color: 'var(--text)', cursor: respondido ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s2)' }}
                      >
                        <span>{op}</span>
                        {respondido && esCorrecta && <Icon name="check" size={16} />}
                      </button>
                    );
                  })}
                </div>
                {elegida != null && (
                  <p className="c-subtitle" style={{ marginTop: 'var(--s3)', color: elegida === q.correcta ? 'var(--ok)' : 'var(--text-2)' }}>
                    {q.feedback}
                  </p>
                )}
              </div>
            )}

            <button type="button" className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>
              {elegida != null ? 'Entendido' : 'Cerrar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
