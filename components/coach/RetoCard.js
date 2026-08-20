'use client';

import Icon from '@/components/ui/Icon';

// Gamificación V2.1 · RETOS (challenges): objetivos acotados de CONDUCTA SANA con progreso visible.
// TCA (línea roja): se premia conducta (registro/agua/proteína/lección/entreno), NUNCA comer menos ni peso.
// SIN CULPA: un reto no cumplido simplemente NO se completa; jamás "fallaste/perdiste" — se renueva solo.
// Fase 1 = UI por props; el wiring a GET /api/coach/retos va en Fase 2. Shape (arquitectura
// challenge_progress + lib/gamification/retos.js):
//   reto = { code, titulo, cadencia:'diario'|'semanal', progreso, meta, estado:'activo'|'completado', xp? }

const CADENCIA = {
  diario: { icon: 'sun', label: 'Reto de hoy' },
  semanal: { icon: 'calendar', label: 'Reto de la semana' },
};

export function RetoCard({ reto }) {
  if (!reto || !reto.titulo) return null;
  const cad = CADENCIA[reto.cadencia] || CADENCIA.diario;
  const meta = reto.meta > 0 ? reto.meta : 1;
  const progreso = Math.max(0, Math.min(reto.progreso || 0, meta));
  const completo = reto.estado === 'completado' || progreso >= meta;
  const pct = Math.min(progreso / meta, 1);

  return (
    <div className="card" style={{ marginBottom: 'var(--s3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s2)', marginBottom: 'var(--s2)' }}>
        <span className="c-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--brand-strong)' }}>
          <Icon name={cad.icon} size={13} /> {cad.label}
        </span>
        {reto.xp > 0 && (
          <span className="c-subtitle" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-3)' }}>
            <Icon name="star" size={13} /> <span className="num">+{reto.xp}</span> XP
          </span>
        )}
      </div>

      <p className="c-title" style={{ margin: '0 0 var(--s2)' }}>{reto.titulo}</p>

      {completo ? (
        <div role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--ok)', fontWeight: 600 }}>
          <span aria-hidden="true" style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: '50%', background: 'var(--ok)', color: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={14} />
          </span>
          ¡Completado!
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--s1)' }}>
            <span className="c-subtitle">Tu avance</span>
            <span className="num c-subtitle" style={{ color: 'var(--text)', fontWeight: 600 }}>{progreso} / {meta}</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progreso}
            aria-valuemin={0}
            aria-valuemax={meta}
            aria-label={`${reto.titulo}: ${progreso} de ${meta}`}
            style={{ height: 8, borderRadius: 'var(--r-pill)', background: 'var(--surface-2)', overflow: 'hidden' }}
          >
            <div style={{ height: '100%', width: `${pct * 100}%`, background: 'var(--brand)', borderRadius: 'var(--r-pill)', transition: 'width var(--dur-ring) var(--ease-spring)' }} />
          </div>
        </>
      )}
    </div>
  );
}

// Sección "Tus retos": 1 diario + 1 semanal auto-asignados (Free). Deploy-safe: si no hay ninguno → null.
export default function RetosSection({ diario, semanal }) {
  if (!diario && !semanal) return null;
  return (
    <section aria-label="Tus retos" style={{ marginBottom: 'var(--s4)' }}>
      <p className="c-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 0 var(--s2)', color: 'var(--brand-strong)' }}>
        <Icon name="flame" size={13} /> Tus retos
      </p>
      {diario && <RetoCard reto={{ cadencia: 'diario', ...diario }} />}
      {semanal && <RetoCard reto={{ cadencia: 'semanal', ...semanal }} />}
    </section>
  );
}
