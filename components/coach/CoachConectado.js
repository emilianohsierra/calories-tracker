'use client';

import Icon from '@/components/ui/Icon';

// Gamificación V2.1 · COACH CONECTADO: superficie que lee el estado de gamificación (nivel/racha/reto
// activo/check-in) y CELEBRA + personaliza el tono. Marco INVITAR/CELEBRAR, jamás deuda: NUNCA
// "no cumpliste / vas atrasado / te falta". TCA: celebra CONDUCTA (registro/constancia), cero peso/dieta/culpa.
// Fase 1 = UI por props; la línea IA real (guardrails del coach) llega en Fase 2. Si no hay `mensaje`, se arma
// una celebración DETERMINISTA desde el estado. Shape:
//   contexto = { nivel?, nivel_nombre?, racha?, reto_activo?:{ titulo }, animo?, mensaje? }

// Celebración determinista (fallback sin IA), SIEMPRE en positivo/neutro-cálido. Nunca menciona peso/dieta.
function lineaCelebra(c) {
  if (c.mensaje) return c.mensaje; // línea del coach (Fase 2) — ya pasa por guardrails TCA
  if ((c.racha ?? 0) >= 2) return `Llevas ${c.racha} días registrando. Qué constancia.`;
  if (c.nivel) return `Vas construyendo tu hábito, paso a paso.`;
  return 'Aquí estoy contigo, a tu ritmo.';
}

export default function CoachConectado({ contexto }) {
  if (!contexto) return null; // deploy-safe: sin estado → no renderiza
  const c = contexto;
  const animoBajo = c.animo === 'bajo' || c.animo === 'cansado';
  const linea = lineaCelebra(c);

  return (
    <section
      aria-label="Tu coach"
      className="card"
      style={{ background: 'linear-gradient(135deg, var(--brand-tint), var(--surface))', border: '1px solid var(--border)', boxShadow: 'var(--shadow-1)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 'var(--s2)' }}>
        <span className="c-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--brand-strong)' }}>
          <Icon name="sparkles" size={13} /> Tu coach
        </span>
        {(c.racha ?? 0) >= 2 && (
          <span className="c-subtitle" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-strong)', marginLeft: 'auto' }}>
            <Icon name="flame" size={14} /> <span className="num">{c.racha}</span>
          </span>
        )}
      </div>

      <p className="c-body" style={{ margin: '0 0 var(--s2)', color: 'var(--text)', fontWeight: 500 }}>{linea}</p>

      {c.nivel && (
        <p className="c-subtitle" style={{ margin: '0 0 var(--s2)' }}>
          Nivel <span className="num" style={{ fontWeight: 700, color: 'var(--text)' }}>{c.nivel}</span>{c.nivel_nombre ? ` · ${c.nivel_nombre}` : ''}
        </p>
      )}

      {/* Invitación (no deuda) a conectar con el reto activo. Si el ánimo está bajo, tono más suave. */}
      {c.reto_activo?.titulo && (
        <p className="c-subtitle" style={{ margin: 0, color: 'var(--text-2)' }}>
          {animoBajo
            ? `Cuando quieras, ${c.reto_activo.titulo.toLowerCase()} sigue ahí. Sin prisa.`
            : `Si te animas, ${c.reto_activo.titulo.toLowerCase()} te suma hoy.`}
        </p>
      )}
    </section>
  );
}
