'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import { postRepaso } from '@/lib/coach/eduClient';
import { useModalA11y } from '@/lib/ui/useModalA11y';

// Tarjeta de REPASO espaciado: pregunta conceptual del backend + 3 opciones (tap) + feedback.
// Refuerza el "por qué"; al fallar, tono de RE-ENSEÑAR (sin castigo). Registra el resultado
// (POST accion:'repaso'). aria-live anuncia el resultado. Deploy-safe: sin quiz → estado suave.
export default function RepasoCard({ repaso, onClose, onDone }) {
  const modalRef = useModalA11y(onClose);
  const [elegida, setElegida] = useState(null);
  // Contrato real del CTO: el quiz vive en `repaso.item` {contexto,pregunta,opciones,correcta,
  // feedback_ok,feedback_no}. `contexto` ancla a un dato real del usuario (puede venir null).
  const q = repaso?.item || repaso?.quiz; // tolera ambos por compat
  const concepto = repaso?.concepto;

  const responder = (idx) => {
    if (elegida != null || !q) return;
    setElegida(idx);
    const correcto = idx === q.correcta;
    postRepaso(concepto, correcto).catch(() => {});
    onDone?.(correcto);
  };

  const acerto = elegida != null && q && elegida === q.correcta;
  const feedback = acerto ? (q?.feedback_ok || q?.feedback) : (q?.feedback_no || q?.feedback);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Repaso" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s3)' }}>
          <h2 style={{ margin: 0, fontSize: 18, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="book" size={18} /> Reforcemos {repaso?.titulo ? `· ${repaso.titulo}` : ''}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ display: 'inline-flex', width: 'var(--touch)', height: 'var(--touch)', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--text-3)', cursor: 'pointer', margin: '-8px -8px 0 0' }}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {!q ? (
          <div className="empty-state" style={{ padding: 'var(--s5) var(--s4)' }}>No hay repaso disponible ahora. Lo vemos otro día.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
            <div>
              {q.contexto && <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>{q.contexto}</p>}
              <div className="c-body" style={{ color: 'var(--text)', fontWeight: 600 }}>{q.pregunta}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
              {q.opciones.map((op, idx) => {
                const esCorrecta = idx === q.correcta;
                const elegidaEsta = elegida === idx;
                const resp = elegida != null;
                const borde = resp && esCorrecta ? 'var(--ok)' : resp && elegidaEsta ? 'var(--border)' : 'var(--border)';
                const fondo = resp && esCorrecta ? 'var(--ok-tint)' : 'var(--surface)';
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => responder(idx)}
                    disabled={resp}
                    aria-pressed={elegidaEsta}
                    style={{ textAlign: 'left', padding: 'var(--s3)', minHeight: 'var(--touch)', borderRadius: 'var(--r-md)', border: `1px solid ${borde}`, background: fondo, color: 'var(--text)', cursor: resp ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s2)' }}
                  >
                    <span>{op}</span>
                    {resp && esCorrecta && <Icon name="check" size={16} />}
                  </button>
                );
              })}
            </div>

            {/* aria-live: anuncia el resultado (como en el quiz educativo). Al fallar: re-enseñar sin castigo. */}
            <div aria-live="polite" role="status">
              {elegida != null && (
                <p className="c-subtitle" style={{ margin: 0, color: acerto ? 'var(--ok)' : 'var(--text-2)' }}>
                  <strong>{acerto ? '¡Bien!' : 'Reforcemos:'}</strong> {feedback}
                </p>
              )}
            </div>

            <button type="button" className="btn btn-primary" onClick={onClose} style={{ width: '100%', minHeight: 'var(--touch)' }}>
              {elegida != null ? 'Listo' : 'Cerrar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
