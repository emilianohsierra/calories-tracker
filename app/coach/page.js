'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import UpgradeModal from '@/components/UpgradeModal';
import PersonalityPicker from '@/components/coach/PersonalityPicker';
import MessageRenderer from '@/components/coach/MessageRenderer';
import MealCard from '@/components/coach/cards/MealCard';
import OptionCard from '@/components/pantry/OptionCard';
import Icon from '@/components/ui/Icon';
import PlanDiff from '@/components/PlanDiff';
import ThemeToggle from '@/components/ThemeToggle';
import CoachOrb from '@/components/coach/CoachOrb';
import TypingIndicator from '@/components/coach/TypingIndicator';
import QuickActions from '@/components/coach/QuickActions';
import Composer from '@/components/coach/Composer';
import { downscaleImage } from '@/lib/image';
import { localDateStr } from '@/lib/format';
import { readPaywall } from '@/lib/paywall';

// Marcador de versión: oculto por defecto; visible solo con ?debug en la URL.
const BUILD = 'v18';

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
  const [paywall, setPaywall] = useState(null); // { variant, feature, usage } del backend
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
      const data = await res.json().catch(() => ({}));
      // Paywall (backend = fuente de verdad): 429/403 con blocked → abre UpgradeModal.
      const pw = readPaywall(res.status, data);
      if (pw) {
        setMessages((m) => m.slice(0, -1)); // quita la burbuja vacía del coach
        setPaywall(pw);
        return;
      }
      if (data.error) {
        console.error('Coach error:', data.error, data.reason || '');
        setLastBubble({ error: true, diag: data.reason ? `${data.error} (${data.reason})` : data.error });
        return;
      }
      if (data.response) {
        setLastBubble({ content: JSON.stringify(data.response), planChange: data.planChange || null });
      } else {
        setLastBubble({ error: true, diag: 'respuesta vacía' });
      }
      // coachRemaining (null=ilimitado/Pro) → estado para badge/aviso 80% (paywall-triggers §3).
      if (data.coachRemaining !== undefined) {
        setUsage((u) => ({ ...(u || {}), coach: { remaining: data.coachRemaining } }));
      }
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

  // "¿Qué puedo comer?" — endpoint DEDICADO (no chat) para poder disparar el paywall:
  // 200 → <=3 Opciones (OptionCard). 429 → UpgradeModal. Despensa vacía → estado ÚTIL (no error).
  // doReco RE-usa la última burbuja (para el Reintentar del MISMO endpoint, N-I2).
  const doReco = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/coach/que-puedo-comer', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setMessages((m) => m.slice(0, -1));
        setPaywall({ variant: data.variant || 'limit', feature: data.feature || 'despensa_reco', usage: data.usage || null });
        return;
      }
      const pw = readPaywall(res.status, data);
      if (pw) { setMessages((m) => m.slice(0, -1)); setPaywall(pw); return; }
      const opciones = data.opciones || data.options || [];
      if (res.ok && opciones.length === 0) {
        // N-I2: despensa vacía / nada seguro cuadra → mensaje ÚTIL + CTA a agregar, NO un error falso.
        setLastBubble({ empty: true, mensaje: data.mensaje || 'Con lo que tienes no encontré algo seguro que cuadre. Agrega productos a tu despensa.' });
        return;
      }
      if (!res.ok) { setLastBubble({ error: true, retryReco: true, diag: data.error || 'sin opciones' }); return; }
      setLastBubble({ options: opciones });
    } catch (e) {
      console.error('que-puedo-comer fail:', e);
      setLastBubble({ error: true, retryReco: true, diag: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const requestQuePuedoComer = () => {
    if (busy) return;
    setMessages((m) => [...m, { role: 'user', content: '¿Qué puedo comer?' }, { role: 'assistant', content: '' }]);
    doReco();
  };

  const retry = () => {
    if (busy) return;
    const lastAssistant = [...messages].reverse().find((x) => x.role === 'assistant');
    setLastBubble({ content: '' }); // vuelve la última burbuja a "cargando"
    if (lastAssistant?.retryReco) { doReco(); return; } // N-I2: Reintentar el MISMO endpoint (reco), no el chat
    const lastUser = [...messages].reverse().find((x) => x.role === 'user');
    if (lastUser) runChat(lastUser.content);
  };

  // "Registrar" de una Opción de la despensa: registra la comida y manda los items
  // (pantry_item_id + cantidad) para el descuento de despensa (backend los usa cuando exista).
  const onRegisterOption = async (items, option) => {
    try {
      const now = new Date();
      const res = await fetch('/api/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: localDateStr(now),
          time: now.toTimeString().slice(0, 5),
          title: option.titulo,
          calories: option.kcal,
          protein_g: option.macros?.prot,
          carbs_g: option.macros?.carb,
          fat_g: option.macros?.gras,
          ingredients: [],
          meal_type: 'comida',
          confidence: 'estimado',
          pantry_items: items,
        }),
      });
      if (res.ok) loadUsage();
      return res.ok;
    } catch {
      return false;
    }
  };

  // Acción de una tarjeta (Karpathy): navegar o re-preguntar al coach.
  // Item 6: los chips triviales (navegar/ver/adjuntar/precargar) retornan ANTES de send() → NO gastan
  // turno Free. Solo las acciones que son interacción real de coach (generar_cena, ver_progreso,
  // actualizar_agua) llaman send(); de esas, las deterministas sin IA se reembolsan server-side
  // (reembolsar_ia), así que el cap Free solo se consume cuando de verdad corre el modelo.
  const onAccion = (accion, prompt) => {
    if (accion?.accion === 'cambiar_plan') return router.push('/perfil');
    if (accion?.accion === 'lista_super') return router.push('/lista?from=coach'); // vuelve al coach con el back (N-I3)
    if (accion?.accion === 'registrar_foto') return fileRef.current?.click(); // abre cámara/galería (flujo Analizar comida)
    // Item 5: registrar_texto precarga el composer (el usuario teclea qué y cuánto) en vez de enviar
    // un mensaje sin datos que solo gastaría un turno y obligaría a la ida-y-vuelta.
    if (accion?.accion === 'registrar_texto') { setInput(prompt || ''); return; }
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

  // Aplicar cambio de objetivo (confirmación UI): reusa POST /api/profile (motor determinista
  // recomputa las metas). Números del motor; el chat solo eligió el coach.
  const applyPlanChange = async (pc, idx) => {
    if (busy) return;
    setBusy(true);
    try {
      const cur = await fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!cur?.profile) return;
      const merged = { ...cur.profile, coach: pc.objetivo };
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (res.ok) {
        setMessages((m) => m.map((x, i) => (i === idx ? { ...x, planChange: null, planApplied: true } : x)));
        fetch('/api/coach/context')
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d) {
              setCtx(d);
              if (d.tone) setTone(d.tone);
            }
          })
          .catch(() => {});
      }
    } catch {
      // no rompe el chat
    } finally {
      setBusy(false);
    }
  };
  const cancelPlanChange = (idx) => setMessages((m) => m.map((x, i) => (i === idx ? { ...x, planChange: null } : x)));

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
      const pw = readPaywall(res.status, data);
      if (pw) {
        setMessages((m) => m.slice(0, -2)); // quita "Analiza esta foto." + burbuja vacía
        setPaywall(pw);
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
          <button type="button" className="link-btn" onClick={() => router.push('/')} aria-label="Inicio" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 'var(--touch)', minHeight: 'var(--touch)' }}><Icon name="chevronLeft" size={20} /></button>
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
            ) : m.options ? (
              <div className="coach-msg">
                <div className="coach-titular">Con lo que tienes y tu meta de hoy:</div>
                {m.options.map((op, k) => (
                  <OptionCard key={k} option={op} onRegister={m.fromHistory ? undefined : onRegisterOption} />
                ))}
              </div>
            ) : m.empty ? (
              <div className="coach-msg">
                <div className="coach-titular">{m.mensaje}</div>
                <div className="c-card__actions">
                  <button type="button" className="btn btn-primary" onClick={() => router.push('/despensa')}>Agregar a mi despensa</button>
                </div>
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
              <>
                <MessageRenderer
                  content={m.content}
                  onAccion={onAccion}
                  onRegisterMeal={m.fromHistory ? undefined : onRegisterMeal}
                />
                {m.planChange && !m.fromHistory && (
                  <div className="coach-msg">
                    <PlanDiff prev={m.planChange.prev} next={m.planChange.next} />
                    <div className="c-card__actions">
                      <button type="button" className="btn btn-primary" onClick={() => applyPlanChange(m.planChange, i)} disabled={busy}>
                        Aplicar cambio
                      </button>
                      <button type="button" className="link-btn" onClick={() => cancelPlanChange(i)} disabled={busy}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
                {m.planApplied && <span className="ring-caption" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="check" size={13} /> Plan actualizado</span>}
              </>
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
        onPuedoComer={requestQuePuedoComer}
      />

      <Composer
        value={input}
        onChange={setInput}
        onSend={() => send()}
        onAttach={() => fileRef.current?.click()}
        busy={busy}
      />

      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPickFile} />

      {paywall && (
        <UpgradeModal
          variant={paywall.variant}
          feature={paywall.feature}
          usage={paywall.usage || usage || { plan: 'free' }}
          resetLabel={paywall.usage?.resetLabel}
          onManual={() => setPaywall(null)}
          onClose={() => setPaywall(null)}
        />
      )}
    </main>
  );
}
