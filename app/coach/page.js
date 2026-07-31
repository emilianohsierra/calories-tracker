'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import UpgradeModal from '@/components/UpgradeModal';
import PersonalityPicker from '@/components/coach/PersonalityPicker';

// Saludo contextual determinista (0 IA), anclado a los pendientes de hoy.
function greetingText(ctx) {
  if (ctx?.pending) {
    return `Hola 👋 Hoy te quedan ${ctx.pending.kcal} kcal y ${ctx.pending.prot} g de proteína. ¿En qué te ayudo?`;
  }
  return 'Hola 👋 Soy tu coach. Pregúntame qué cenar, cómo vas hoy o pídeme ayuda con tu meta.';
}

// Mi Coach — chat de la Fase 1 (streaming). R2: personalidad + saludo contextual.
export default function CoachPage() {
  const router = useRouter();
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [ctx, setCtx] = useState(null);
  const [tone, setTone] = useState('amigable');
  const threadRef = useRef(null);

  useEffect(() => {
    fetch('/api/coach/history')
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});
    fetch('/api/coach/context')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setCtx(d);
          if (d.tone) setTone(d.tone);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  const setLastBubble = (content) =>
    setMessages((m) => {
      const copy = m.slice();
      if (copy.length) copy[copy.length - 1] = { role: 'assistant', content };
      return copy;
    });

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    try {
      const res = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (res.status === 402) {
        setMessages((m) => m.slice(0, -1)); // quita la burbuja vacía del coach
        setShowPlans(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surfacing del error/diagnóstico real del server (nunca burbuja en blanco).
        setLastBubble(data.error ? (data.reason ? `${data.error} (${data.reason})` : data.error) : 'No pude responder ahora. Intenta de nuevo.');
        return;
      }
      setLastBubble(data.text || 'El coach no devolvió respuesta. Intenta de nuevo.');
    } catch {
      setLastBubble('No pude responder ahora. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="coach-shell">
      <header className="coach-header">
        <button type="button" className="link-btn" onClick={() => router.push('/')}>
          ‹ Inicio
        </button>
        <span className="coach-title">Mi Coach</span>
        <span />
      </header>

      <PersonalityPicker value={tone} onChange={setTone} />

      <div className="coach-thread" ref={threadRef}>
        {messages.length === 0 && <div className="chat-bubble coach">{greetingText(ctx)}</div>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role === 'user' ? 'user' : 'coach'}`}>
            {m.content || (busy && i === messages.length - 1 ? '…' : '')}
          </div>
        ))}
      </div>

      <div className="coach-composer">
        <input
          type="text"
          value={input}
          placeholder="Escribe a tu coach…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={busy}
        />
        <button type="button" className="btn btn-primary" onClick={send} disabled={busy || !input.trim()}>
          ↑
        </button>
      </div>

      {showPlans && <UpgradeModal variant="plans" usage={{ plan: 'free' }} onClose={() => setShowPlans(false)} />}
    </main>
  );
}
