'use client';

import { useId } from 'react';

// Identidad del coach (Rams §9): orbe abstracto con gradiente radial, sin cara/robot/emoji.
// "Respiración" sutil (off con reduced-motion, via CSS .coach-orb.animate).
export default function CoachOrb({ size = 28, animate = true }) {
  // id estable y SSR-safe para el gradiente (evita mismatch de hidratación).
  const gid = useId();
  return (
    <span className={`coach-orb${animate ? ' animate' : ''}`} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <defs>
          <radialGradient id={gid} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="var(--brand-strong)" />
            <stop offset="100%" stopColor="var(--brand)" />
          </radialGradient>
        </defs>
        <circle cx="16" cy="16" r="13" fill={`url(#${gid})`} />
        <circle cx="16" cy="16" r="9" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
        <circle cx="16" cy="16" r="5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      </svg>
    </span>
  );
}
