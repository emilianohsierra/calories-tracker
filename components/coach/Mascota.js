'use client';

import { useEffect, useId, useState } from 'react';

// Mascota "Orbe" = el CoachOrb con vida (dir. A de plan/mascota-diseno.md). Orbe teal + cara mínima
// (2 ojos + boca). Estados: neutro | contento | animando | celebrando | comprensivo. NUNCA triste/
// enfermo/culpa. Microanimaciones reduced-motion-safe: respiración (clase .coach-orb.animate ya en
// globals, con guard), parpadeo y brinco de celebración (JS, gated por prefers-reduced-motion).
// La UI NO inventa: el estado deriva del backend de gamificación (o de data.mascota si lo trae).

const PREF_KEY = 'mascota_oculta';
export function mascotaOculta() {
  try { return typeof window !== 'undefined' && localStorage.getItem(PREF_KEY) === '1'; } catch { return false; }
}
export function setMascotaOculta(v) {
  try {
    if (v) localStorage.setItem(PREF_KEY, '1'); else localStorage.removeItem(PREF_KEY);
    window.dispatchEvent(new Event('mascota-pref'));
  } catch { /* sin persistencia */ }
}

// Estado de la mascota desde el contrato del CTO (lib/gamification/mascota.js → route gamificacion):
//   data.mascota = { animo ∈ ANIMOS(6), submodo:'recuperacion'|'cuidado'|null, reaccion, reposo, mensaje } | null
// El backend YA aplica las guardias TCA (UNDER_EATING → comprensivo/cuidado, NUNCA feliz; piso/EN_RANGO).
// Devuelve { estado, submodo? } o null (= no renderizar). Reglas:
//  · mascota objeto → usamos su `animo` (con fallback a `estado` por si cambia el nombre).
//  · mascota === null → el backend dice "sin mascota" → no renderiza (respeta flag/estado).
//  · clave `mascota` AUSENTE (backend viejo) → derive INTERIM SEGURO: nunca 'contento' desde el cliente
//    (requiere EN_RANGO/piso que no vemos aquí; derivarlo violaría "UNDER_EATING nunca pone feliz").
export function estadoMascota(data) {
  if (!data) return null;
  const m = data.mascota;
  if (typeof m === 'string') return { estado: m };
  if (m && (m.animo || m.estado)) return { estado: m.animo || m.estado, submodo: m.submodo || undefined };
  if (m === null) return null; // backend presente y explícito: no hay mascota → no renderiza
  if (data.celebracion) return { estado: 'celebrando' };
  if (data.racha?.recuperacion) return { estado: 'comprensivo', submodo: 'recuperacion' };
  if (data.siguiente_accion) return { estado: 'animando' };
  return { estado: 'neutro_tranquilo' };
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

const STROKE = { stroke: 'var(--brand-ink)', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' };

export default function Mascota({ estado = 'neutro_tranquilo', submodo, size = 48, animar = true, 'aria-hidden': ariaHidden }) {
  const gid = useId();
  const reduce = useReducedMotion();
  const [oculta, setOculta] = useState(false);
  const [blink, setBlink] = useState(false);
  const [pop, setPop] = useState(false);

  // Opt-out (respeta la preferencia; se puede ocultar sin culpa desde Mi progreso).
  useEffect(() => {
    const sync = () => setOculta(mascotaOculta());
    sync();
    window.addEventListener('mascota-pref', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('mascota-pref', sync); window.removeEventListener('storage', sync); };
  }, []);

  // Parpadeo ocasional (no en reduced-motion).
  useEffect(() => {
    if (reduce || !animar) return undefined;
    const t = setInterval(() => { setBlink(true); setTimeout(() => setBlink(false), 130); }, 6500);
    return () => clearInterval(t);
  }, [reduce, animar]);

  const est = estado === 'neutro' ? 'neutro_tranquilo' : estado; // compat con el nombre viejo

  // Brinco de celebración, una sola vez (<=700ms), no en reduced-motion.
  useEffect(() => {
    if (est !== 'celebrando' || reduce || !animar) return undefined;
    setPop(true);
    const t = setTimeout(() => setPop(false), 340);
    return () => clearTimeout(t);
  }, [est, reduce, animar]);

  if (oculta) return null;

  const feliz = est === 'celebrando';
  const wink = est === 'animando';
  const durmiendo = est === 'durmiendo';
  const comprensivo = est === 'comprensivo';
  const cuidado = comprensivo && submodo === 'cuidado';
  const label = {
    neutro_tranquilo: 'Tu compañero, tranquilo', contento: 'Tu compañero, contento', animando: 'Tu compañero, animándote',
    celebrando: 'Tu compañero, celebrando', comprensivo: 'Tu compañero, contigo', durmiendo: 'Tu compañero, descansando',
  }[est] || 'Tu compañero';

  // Ojos (durmiendo = cerrados serenos ‿ ‿; celebrando = felices ^^; wink = un ojo; resto = puntos).
  const ojos = durmiendo ? (
    <>
      <path d="M21 28 q3 3 6 0" {...STROKE} />
      <path d="M37 28 q3 3 6 0" {...STROKE} />
    </>
  ) : blink ? (
    <>
      <path d="M22 28 h4" {...STROKE} />
      <path d="M38 28 h4" {...STROKE} />
    </>
  ) : feliz ? (
    <>
      <path d="M21 29 q3 -4 6 0" {...STROKE} />
      <path d="M37 29 q3 -4 6 0" {...STROKE} />
    </>
  ) : (
    <>
      <circle cx="24" cy="28" r="2.6" fill="var(--brand-ink)" />
      {wink ? <path d="M37 28 q3 2.5 6 0" {...STROKE} /> : <circle cx="40" cy="28" r="2.6" fill="var(--brand-ink)" />}
    </>
  );

  // Boca (siempre neutral↔positiva; nada de mueca triste).
  const boca = feliz
    ? <path d="M26 34 q6 6 12 0" {...STROKE} />
    : est === 'contento'
      ? <path d="M27 35 q5 4 10 0" {...STROKE} />
      : durmiendo
        ? <path d="M29 35 q3 2 6 0" {...STROKE} />
        : comprensivo
          ? <path d="M27 35 q5 3 10 0" {...STROKE} />
          : est === 'animando'
            ? <path d="M28 35 q4 3 8 0" {...STROKE} />
            : <path d="M28 35 q4 2 8 0" {...STROKE} />;

  return (
    <span
      className={animar && !reduce ? 'coach-orb animate' : 'coach-orb'}
      role={ariaHidden ? undefined : 'img'}
      aria-label={ariaHidden ? undefined : label}
      aria-hidden={ariaHidden}
      style={{ display: 'inline-flex', width: size, height: size, transform: pop ? 'translateY(-6px)' : 'translateY(0)', transition: reduce ? 'none' : 'transform 340ms var(--ease-spring)' }}
    >
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <defs>
          <radialGradient id={gid} cx="38%" cy="34%" r="72%">
            <stop offset="0%" stopColor="var(--brand-strong)" />
            <stop offset="100%" stopColor="var(--brand)" />
          </radialGradient>
        </defs>
        <ellipse cx="32" cy="58" rx="15" ry="3" fill="rgba(0,0,0,.16)" />
        <circle cx="32" cy="30" r="22" fill={`url(#${gid})`} />
        {/* rubor sutil solo al celebrar */}
        {feliz && (
          <>
            <ellipse cx="21" cy="34" rx="3" ry="2" fill="var(--brand-ink)" opacity=".28" />
            <ellipse cx="43" cy="34" rx="3" ry="2" fill="var(--brand-ink)" opacity=".28" />
          </>
        )}
        {ojos}
        {boca}
        {/* destello (celebrando / animando tenue) */}
        {(feliz || wink) && (
          <path d="M49 12 l1.5 3.2 3.2 1.5 -3.2 1.5 -1.5 3.2 -1.5 -3.2 -3.2 -1.5 3.2 -1.5z" fill="var(--brand-strong)" opacity={feliz ? 0.9 : 0.5} />
        )}
        {/* corazoncito cálido en comprensivo (NO triste). Submodo 'cuidado' suma un destello tenue. */}
        {comprensivo && (
          <path d="M45 18 a2 2 0 0 1 3 0 a2 2 0 0 1 3 0 q0 2.4 -3 4.2 q-3 -1.8 -3 -4.2z" fill="var(--brand-strong)" opacity=".55" />
        )}
        {cuidado && (
          <path d="M15 16 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1z" fill="var(--brand-strong)" opacity=".45" />
        )}
        {/* "z z" sereno en durmiendo (descanso, no tristeza) */}
        {durmiendo && (
          <g fill="none" stroke="var(--brand-strong)" strokeWidth="1.6" strokeLinecap="round" opacity=".7">
            <path d="M45 14 h4 l-4 4 h4" />
            <path d="M51 9 h3 l-3 3 h3" />
          </g>
        )}
      </svg>
    </span>
  );
}
