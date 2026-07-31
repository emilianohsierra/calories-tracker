'use client';

import { useEffect, useState } from 'react';

// Carga elegante (Rams §10.1): 3 puntos que respiran + microcopy contextual rotativo.
// Reemplaza el "…" plano. Animación de puntos en CSS (.coach-typing), off con reduced-motion.
const MSGS = ['El Coach está analizando tu día…', 'Revisando tus macros…', 'Preparando una idea…'];

export default function TypingIndicator() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % MSGS.length), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="coach-typing-wrap">
      <span className="coach-typing" aria-hidden="true">
        <i /><i /><i />
      </span>
      <span className="coach-typing-msg" aria-live="polite">{MSGS[i]}</span>
    </span>
  );
}
