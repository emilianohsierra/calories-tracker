'use client';

import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/Icon';

// ── Oferta (fuente: plan/paywall-copy-offer.md, Drucker) ──────────────────────
// MENSUAL SOLO en este release: es el único price cobrable en Stripe (test).
// El anual ($799) es fast-follow honesto: cuando el price_id sea cobrable se
// enciende el toggle de abajo (BILLING). No se pre-marca ni se muestra aún.
const BILLING = [
  { id: 'month', label: 'Mensual', amount: '99', per: 'mes', active: true },
  // { id: 'year', label: 'Anual', amount: '799', per: 'año', note: 'equivale a $66/mes', active: false }, // fast-follow
];
const PLAN = BILLING.find((b) => b.active);
const PRICE_LABEL = `$${PLAN.amount} ${'MXN'}/${PLAN.per}`;

// ── Regla anti-dark-pattern (NO negociable): solo se muestra como INCLUIDO lo
// que está DESPLEGADO al shippear. Si el coach aún no está vivo como Pro al
// publicar, poner COACH_LIVE = false → headline de transición y los bullets del
// coach bajan a "Próximamente". Un solo interruptor, honesto y trivial de flipear.
const COACH_LIVE = true;

const COACH_BULLETS = [
  {
    icon: 'message',
    title: 'Tu coach de nutrición, sin límite',
    desc: 'Pregúntale qué cenar, cómo vas o qué ajustar. Conoce tus datos y responde en tu idioma.',
  },
  {
    icon: 'star',
    title: 'Coaches especializados para tu objetivo',
    desc: 'Pérdida de grasa, músculo, running, bienestar o recomposición, con tu plan a la medida.',
  },
  {
    icon: 'clipboard',
    title: 'Una memoria que no te olvida',
    desc: 'Recuerda tus platillos, tus preferencias y tu progreso; entre más te acompaña, mejor te conoce.',
  },
];
const CORE_BULLET = {
  icon: 'camera',
  title: 'Análisis con IA ilimitados + corrección',
  desc: 'Registra por foto sin contar y ajusta cada estimación hasta que quede justa.',
};

// "Próximamente en Pro": atenuado, badge "Pronto", SIN fecha ni lenguaje médico.
const SOON_BASE = [
  { title: 'Dashboard premium', desc: 'Tus tendencias, adherencia y evolución completas.' },
  { title: 'Planes de comida dinámicos', desc: 'Menús que cuadran tus macros y se recalculan al cambiar una comida.' },
];

// Beneficios LIVE (acompañamiento primero). Si el coach no está vivo, sus bullets
// se muestran como "Próximamente" en vez de como incluidos.
const LIVE_BULLETS = COACH_LIVE ? [...COACH_BULLETS, CORE_BULLET] : [CORE_BULLET];
const SOON_BULLETS = COACH_LIVE
  ? SOON_BASE
  : [...COACH_BULLETS.map(({ title, desc }) => ({ title, desc })), ...SOON_BASE];

// Comparativa Free vs Pro — SOLO filas de features LIVE (las PRONTO viven en el
// bloque "Próximamente", nunca como Pro-incluido en la tabla).
const COMPARE = [
  { feature: 'Análisis de foto con IA', free: '10 / mes', pro: 'Ilimitado' },
  { feature: 'Reanálisis con corrección', free: '—', pro: 'Sí' },
  { feature: 'Registro manual', free: 'Ilimitado', pro: 'Ilimitado' },
  ...(COACH_LIVE
    ? [
        { feature: 'Coach de nutrición', free: '3 msj / mes', pro: 'Ilimitado' },
        { feature: 'Coaches especializados', free: '1 objetivo', pro: 'Los 5' },
        { feature: 'Memoria del coach', free: '10 platillos', pro: 'Ilimitada' },
      ]
    : []),
  { feature: 'Resumen diario y macros', free: 'Sí', pro: 'Sí' },
];

const HEADLINE = COACH_LIVE ? 'No pierdas a tu entrenador' : 'Tu registro, sin límites';
const SUBHEAD = COACH_LIVE
  ? 'Pro es tener un coach que te conoce, recuerda tus comidas y te acompaña a tu meta, todos los días.'
  : 'Analiza todas tus comidas con IA y ajusta cada estimación hasta que quede justa.';

const REASSURE = 'Cancela cuando quieras. Conservas tus datos siempre.';

// El backend puede pasar `feature` (qué función Pro intentó usar el usuario) para
// destacar el bullet relevante en la variante 'plans'. Solo aplica a bullets [LIVE];
// si el feature no mapea a algo desplegado, no se destaca nada (honesto).
const FEATURE_MAP = {
  // Enum del CTO (plan/paywall-seam-backend.md): coach_chat | analisis | reanalisis
  analisis: 'Análisis con IA ilimitados + corrección',
  reanalisis: 'Análisis con IA ilimitados + corrección',
  coach_chat: 'Tu coach de nutrición, sin límite',
  // Aliases tolerantes (por si el backend evoluciona el naming)
  analysis: 'Análisis con IA ilimitados + corrección',
  ai: 'Análisis con IA ilimitados + corrección',
  coach: 'Tu coach de nutrición, sin límite',
  coaches: 'Coaches especializados para tu objetivo',
  especializados: 'Coaches especializados para tu objetivo',
  memoria: 'Una memoria que no te olvida',
  memory: 'Una memoria que no te olvida',
};

// Copy de la variante 'limit' por feature (T1 análisis / T2 coach). La ruta gratis
// difiere: en análisis es pasar a registro manual; en coach es seguir en Free.
const LIMIT_COPY = {
  analisis: {
    title: (n) => (
      <>
        Ya usaste tus <span className="num">{n}</span> análisis con IA de este mes
      </>
    ),
    body: 'Puedes seguir registrando a mano gratis e ilimitado, o pásate a Pro para analizar con IA sin contar.',
    manual: 'Seguir con registro manual',
    icon: 'pencil',
  },
  coach_chat: {
    title: (n) => (
      <>
        Ya usaste tus <span className="num">{n}</span> mensajes con el coach de este mes
      </>
    ),
    body: 'Puedes seguir usando la app y registrando a mano gratis, o pásate a Pro para hablar con tu coach sin límite.',
    manual: 'Seguir en Free',
    icon: 'message',
  },
};

// variant: 'plans' (comparativa + teaser) | 'limit' (paywall al agotar los análisis del mes)
// feature: opcional, qué Pro tocó el usuario (destaca su bullet en 'plans')
export default function UpgradeModal({ variant = 'plans', feature, usage, resetLabel, onClose, onManual }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isPro = usage?.plan === 'pro';
  const limit = usage?.cap ?? usage?.limit ?? 10; // el payload del CTO usa `cap`
  const lc = LIMIT_COPY[feature] || LIMIT_COPY.analisis; // copy de límite según la feature

  // Destaca (y sube al frente) el bullet de la función que trajo al usuario aquí.
  const focusTitle = feature ? FEATURE_MAP[feature] : undefined;
  const liveBullets = focusTitle
    ? [
        ...LIVE_BULLETS.filter((b) => b.title === focusTitle),
        ...LIVE_BULLETS.filter((b) => b.title !== focusTitle),
      ]
    : LIVE_BULLETS;

  const overlayRef = useRef(null);
  const modalRef = useRef(null);
  const closeRef = useRef(null);
  const busyRef = useRef(busy);
  busyRef.current = busy; // A7: Escape lee el busy actual sin re-montar el efecto

  // ── A11y: Escape para cerrar, bloqueo de scroll, foco inicial + trampa de foco,
  // y retorno de foco al desmontar. No toca la lógica de negocio.
  useEffect(() => {
    const prevActive = typeof document !== 'undefined' ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    modalRef.current?.focus(); // A8: foco inicial al diálogo (anuncia el label), no a la X

    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (busyRef.current) return; // A7: no cerrar durante el checkout
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = modalRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prevActive?.focus?.();
    };
  }, [onClose]);

  // Inicia el flujo de Stripe YA existente (checkout o portal). NO se rehace el backend.
  const go = async (endpoint) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'No se pudo continuar.');
      window.location.href = data.url; // → Stripe Checkout / Billing Portal
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const subscribe = () => go('/api/checkout');
  const manage = () => go('/api/portal');

  const PriceTag = () => (
    <div className="pw-price">
      <span className="pw-price-amt num">${PLAN.amount}</span>
      <span className="pw-price-per">
        MXN / {PLAN.per}
      </span>
      {/* Hueco fast-follow: cuando el price anual sea cobrable en Stripe se
          renderiza aquí el toggle Mensual/Anual (BILLING). Default mensual,
          jamás pre-marcado. Hoy oculto porque solo mensual es cobrable. */}
    </div>
  );

  const PrimaryCta = ({ label }) => (
    <button type="button" className="btn btn-primary pw-cta" onClick={subscribe} disabled={busy}>
      {busy ? (
        <>
          <span className="spinner pw-spin" aria-hidden="true" />
          Un momento…
        </>
      ) : (
        label
      )}
    </button>
  );

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="modal pw-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pw-title"
        tabIndex={-1}
      >
        <div className="pw-head">
          <span className="pw-eyebrow">
            <Icon name="sparkles" size={15} /> Plan Pro
          </span>
          <button
            type="button"
            className="pw-close"
            ref={closeRef}
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {variant === 'limit' ? (
          // ── Variante límite: empática, no punitiva. Ruta gratis SIEMPRE visible. ──
          <>
            <h2 id="pw-title" className="pw-title pw-title-sm">
              {lc.title(limit)}
            </h2>
            <p className="pw-limit-body">{lc.body}</p>

            {error && <div className="error-banner" role="alert">{error}</div>}

            <PriceTag />

            <div className="plan-actions">
              <PrimaryCta label={`Hazte Pro — ${PRICE_LABEL}`} />
              <p className="pw-reassure">{REASSURE}</p>
              <button type="button" className="btn btn-ghost" onClick={onManual} disabled={busy}>
                <Icon name={lc.icon} size={16} /> {lc.manual}
              </button>
              <button type="button" className="link-btn pw-tertiary" onClick={onClose} disabled={busy}>
                {resetLabel ? `Tu cupo gratis se reinicia el ${resetLabel}` : 'Cerrar'}
              </button>
            </div>
          </>
        ) : isPro ? (
          // ── Variante planes · usuario YA Pro: gestionar, sin re-vender. ──
          <>
            <h2 id="pw-title" className="pw-title">
              Tu plan Pro está activo
            </h2>
            <p className="pw-sub">Gracias por acompañarte con nosotros. Aquí administras tu suscripción.</p>

            {usage?.subscription?.cancel_at_period_end && (
              <p className="confidence-note pw-cancel-note">
                Seguirás siendo Pro hasta el fin del periodo; luego pasas a Free. Tus datos se conservan.
              </p>
            )}

            {error && <div className="error-banner" role="alert">{error}</div>}

            <div className="plan-actions">
              <button type="button" className="btn btn-primary pw-cta" onClick={manage} disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner pw-spin" aria-hidden="true" />
                    Un momento…
                  </>
                ) : (
                  'Administrar suscripción'
                )}
              </button>
              <button type="button" className="link-btn" onClick={onClose} disabled={busy}>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          // ── Variante planes · usuario enganchado: vender tranquilidad. ──
          <>
            <h2 id="pw-title" className="pw-title">
              {HEADLINE}
            </h2>
            <p className="pw-sub">{SUBHEAD}</p>

            <ul className="pw-benefits">
              {liveBullets.map((b) => (
                <li
                  key={b.title}
                  className={b.title === focusTitle ? 'pw-benefit pw-benefit--focus' : 'pw-benefit'}
                >
                  <span className="pw-benefit-ico" aria-hidden="true">
                    <Icon name={b.icon} size={18} />
                  </span>
                  <span>
                    <span className="pw-benefit-t">{b.title}</span>
                    <span className="pw-benefit-d">{b.desc}</span>
                  </span>
                </li>
              ))}
            </ul>

            {SOON_BULLETS.length > 0 && (
              <div className="pw-soon">
                <p className="pw-soon-head">Próximamente en Pro</p>
                {SOON_BULLETS.map((s) => (
                  <div key={s.title} className="pw-soon-item">
                    <span className="pw-badge">Pronto</span>
                    <span>
                      <span className="pw-benefit-t">{s.title}</span>
                      <span className="pw-benefit-d">{s.desc}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <table className="plan-table pw-table">
              <caption className="pw-table-cap">Free vs Pro</caption>
              <thead>
                <tr>
                  <th scope="col">Función</th>
                  <th scope="col">Free</th>
                  <th scope="col">Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.feature}>
                    <td>{row.feature}</td>
                    <td>{row.free}</td>
                    <td className="pw-pro-cell">{row.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="plan-fineprint pw-fineprint">El registro manual siempre es gratis. Sin permanencia.</p>

            {/* A10: precio + CTA anclados al fondo del sheet — el valor scrollea arriba,
                el muro sigue DESPUÉS del valor y "Hazte Pro" queda siempre alcanzable. */}
            <div className="pw-dock">
              {error && <div className="error-banner" role="alert">{error}</div>}
              <PriceTag />
              <div className="plan-actions">
                <PrimaryCta label={`Hazte Pro — ${PRICE_LABEL}`} />
                <p className="pw-reassure">{REASSURE}</p>
                <button type="button" className="link-btn" onClick={onClose} disabled={busy}>
                  Ahora no
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
