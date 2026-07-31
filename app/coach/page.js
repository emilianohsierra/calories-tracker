'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import UpgradeModal from '@/components/UpgradeModal';
import PersonalityPicker from '@/components/coach/PersonalityPicker';
import MessageRenderer from '@/components/coach/MessageRenderer';
import MealCard from '@/components/coach/cards/MealCard';
import ThemeToggle from '@/components/ThemeToggle';
import CoachOrb from '@/components/coach/CoachOrb';
import TypingIndicator from '@/components/coach/TypingIndicator';
import QuickActions from '@/components/coach/QuickActions';
import Composer from '@/components/coach/Composer';
import { downscaleImage } from '@/lib/image';
import { localDateStr } from '@/lib/format';

// Marcador de versión: oculto por defecto; visible solo con ?debug en la URL.
const BUILD = 'v16';

// Saludo contextual determinista (0 IA), anclado a los pendientes de hoy. Sin emojis (Rams §2).
function greetingText(ctx) {
  if (ctx?.pending) {
    return `Hoy te quedan ${ctx.pending.kcal} kcal y ${ctx.pending.prot} g de proteína. ¿En qué te ayudo?`;
  }
  return 'Soy tu coach. Pregúntame qué cenar, cómo vas hoy o pídeme ayuda con tu meta.';
}

// Mi Coach — chat. R1: renderer/tool responder. R3: shell premium. R4: dark. R5: estados.
export default function CoachPage() {
  const router = useRouter();
  const [messages, setMessages] = useState([]); // {role, content, error?, diag?}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [ctx, setCtx] = useState(null);
  const [tone, setTone] = useState('amigable');
  const [debug, setDebug] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState(null);
  const [usage, setUsage] = useState(null);
  const threadRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    setDebug(typeof window !== 'undefined' && window.location.search.includes('debug'));
    fetch('/api/coach/history')
      // fromHistory: las propuestas cargadas del historial NO son accionables (evita
      // doble alta al recargar). Solo la propuesta FRESCA de la sesión registra.
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setMessages((d.messages || []).map((m) => ({ ...m, fromHistory: true }))))
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
    loadUsage();
  }, []);

  const loadUsage = () => {
    fetch('/api/usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUsage(d))
      .catch(() => {});
  };

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  const setLastBubble = (patch) =>
    setMessages((m) => {
      const copy = m.slice();
      if (copy.length) copy[copy.length - 1] = { role: 'assistant', content: '', ...patch };
      return copy;
    });

  // Fetch del turno (reutilizado por send y por Reintentar). `analysis` = foto pendiente.
  const runChat = async (text, analysis) => {
    setBusy(true);
    try {
      const res = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, ...(analysis ? { pendingAnalysis: analysis } : {}) }),
      });
      if (res.status === 402) {
        setMessages((m) => m.slice(0, -1)); // quita la burbuja vacía del coach
        setShowPlans(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.error) {
        console.error('Coach error:', data.error, data.reason || '');
        setLastBubble({ error: true, diag: data.reason ? `${data.error} (${data.reason})` : data.error });
        return;
      }
      setLastBubble({ content: data.response ? JSON.stringify(data.response) : '' });
      if (!data.response) setLastBubble({ error: true, diag: 'respuesta vacía' });
      if (data.registered) {
        setPendingAnalysis(null);
        loadUsage(); // el registro cambió el día
      }
    } catch (e) {
      console.error('Coach fetch fail:', e);
      setLastBubble({ error: true, diag: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const send = (override, analysis) => {
    const text = (typeof override === 'string' ? override : input).trim();
    if (!text || busy) return;
    if (typeof override !== 'string') setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    runChat(text, analysis);
  };

  const retry = () => {
    if (busy) return;
    const lastUser = [...messages].reverse().find((x) => x.role === 'user');
    if (!lastUser) return;
    setLastBubble({ content: '' }); // vuelve la última burbuja a "cargando"
    runChat(lastUser.content);
  };

  // Acción de una tarjeta (Karpathy): navegar o re-preguntar al coach.
  const onAccion = (accion, prompt) => {
    if (accion?.accion === 'cambiar_plan') return router.push('/perfil');
    if (prompt) send(prompt);
  };

  // "Registrar" de una MealCard propuesta por el coach (p.ej. registrar_texto): confirma
  // la mutación reusando POST /api/meals. Números del backend (estimación), no del chat.
  const onRegisterMeal = async (m) => {
    try {
      const now = new Date();
      const res = await fetch('/api/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: localDateStr(now),
          time: now.toTimeString().slice(0, 5),
          title: m.titulo,
          calories: m.kcal,
          protein_g: m.prot_g,
          carbs_g: m.carb_g,
          fat_g: m.gras_g,
          ingredients: m.ingredientes,
          meal_type: 'comida',
          confidence: 'estimado',
        }),
      });
      if (res.ok) loadUsage();
      return res.ok;
    } catch {
      return false;
    }
  };

  // Adjuntar foto → analizar en el chat (reusa /api/analyze) → propuesta para confirmar.
  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || busy) return;
    let blob;
    try {
      blob = await downscaleImage(file);
    } catch {
      return; // no rompe el chat
    }
    setMessages((m) => [...m, { role: 'user', content: 'Analiza esta foto.' }, { role: 'assistant', content: '' }]);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', blob, 'platillo.jpg');
      const res = await fetch('/api/analyze', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429 || res.status === 402) {
        setMessages((m) => m.slice(0, -2)); // quita "Analiza esta foto." + burbuja vacía
        setShowPlans(true);
        return;
      }
      if (!res.ok || data.error || data.es_comida === false) {
        setLastBubble({ error: true, diag: data.error || 'no se pudo analizar' });
        return;
      }
      setPendingAnalysis(data);
      setLastBubble({ proposal: data });
    } catch (err) {
      setLastBubble({ error: true, diag: String(err?.message || err) });
    } finally {
      setBusy(false);
    }
  };

  // Confirmación en UI ANTES de mutar: registrar la foto vía el coach (tool-use).
  const confirmRegister = (analysis) => {
    setMessages((m) => m.filter((x) => !x.proposal));
    send('Registra la comida de la foto.', analysis);
    return true;
  };
  const discardProposal = () => {
    setMessages((m) => m.filter((x) => !x.proposal));
    setPendingAnalysis(null);
  };

  return (
    <main className="coach-shell">
      <header className="coach-header">
        <div className="coach-brand">
          <button type="button" className="link-btn" onClick={() => router.push('/')} aria-label="Inicio">‹</button>
          <CoachOrb size={26} />
          <span className="coach-title">Mi Coach</span>
        </div>
        <div className="coach-controls">
          <PersonalityPicker value={tone} onChange={setTone} />
          <ThemeToggle compact />
          {debug && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>build {BUILD}</span>}
        </div>
      </header>

      <div className="coach-thread" ref={threadRef}>
        {messages.length === 0 && <div className="chat-bubble coach">{greetingText(ctx)}</div>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role === 'user' ? 'user' : 'coach'}`}>
            {m.error ? (
              <div className="chat-error">
                <span>No pude responder ahora. Inténtalo de nuevo.</span>
                <button type="button" className="link-btn retry" onClick={retry} disabled={busy}>Reintentar</button>
                {debug && m.diag && <span className="ring-caption">{m.diag}</span>}
              </div>
            ) : m.proposal ? (
              <div className="coach-msg">
                <div className="coach-titular">Esto detecté en tu foto. ¿Lo registro?</div>
                <MealCard
                  titulo={m.proposal.titulo}
                  kcal={m.proposal.calorias}
                  prot_g={m.proposal.proteinas_g}
                  carb_g={m.proposal.carbohidratos_g}
                  gras_g={m.proposal.grasas_g}
                  ingredientes={m.proposal.ingredientes}
                  onRegister={() => confirmRegister(m.proposal)}
                />
                <button type="button" className="link-btn" onClick={discardProposal} disabled={busy}>Descartar</button>
              </div>
            ) : m.content ? (
              <MessageRenderer
                content={m.content}
                onAccion={onAccion}
                onRegisterMeal={m.fromHistory ? undefined : onRegisterMeal}
              />
            ) : busy && i === messages.length - 1 ? (
              <TypingIndicator />
            ) : (
              ''
            )}
          </div>
        ))}
      </div>

      <QuickActions
        visible={!busy}
        onAnalizar={() => fileRef.current?.click()}
        onSend={(t) => send(t)}
        onNav={(p) => router.push(p)}
      />

      <Composer
        value={input}
        onChange={setInput}
        onSend={() => send()}
        onAttach={() => fileRef.current?.click()}
        busy={busy}
      />

      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPickFile} />

      {showPlans && <UpgradeModal variant="plans" usage={usage || { plan: 'free' }} onClose={() => setShowPlans(false)} />}
    </main>
  );
}
