import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assembleContext } from '@/lib/coach/context';

export const runtime = 'nodejs';
export const maxDuration = 60;

const COACH_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 800;

// BUG 2 fix: supabase.rpc(...) es un thenable de PostgREST, NO una Promise nativa — no
// tiene .catch(). Usar .catch() directo lanza TypeError. Este helper lo envuelve seguro.
async function safeRpc(supabase, fn, args) {
  try {
    await supabase.rpc(fn, args);
  } catch (e) {
    console.error('rpc fallo:', fn, e?.message);
  }
}

// SIEMPRE devuelve JSON (nunca 500 crudo/HTML): la burbuja muestra el error REAL.
export async function POST(request) {
  const t0 = Date.now();
  let supabase = null;
  let requestId = null;
  try {
    supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

    // BUG 1 fix: leer la key EXACTA de la misma var que analyze, con trim defensivo
    // (whitespace/newline al pegar en Vercel = causa #1 de "invalid x-api-key").
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'El coach no está disponible por ahora.' }, { status: 503 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }
    const message = String(body?.message || '').trim().slice(0, 2000);
    if (!message) return NextResponse.json({ error: 'Escribe un mensaje' }, { status: 400 });

    // CAP DE COSTO DURO: reserva atómica.
    requestId = crypto.randomUUID();
    const { data: gate, error: gErr } = await supabase.rpc('consumir_ia', { p_request_id: requestId, p_feature: 'chat' });
    if (gErr || !gate) {
      requestId = null;
      return NextResponse.json({ error: `⚠️ Cuota: ${gErr?.message || 'sin dato'}` }, { status: 200 });
    }
    if (!gate.allowed) {
      requestId = null;
      if (gate.reason === 'free_limit') {
        return NextResponse.json({ error: 'Llegaste a tus preguntas gratis del coach este mes.', reason: 'free_limit' }, { status: 402 });
      }
      return NextResponse.json({ error: 'El coach no está disponible por el momento.', reason: gate.reason }, { status: 503 });
    }

    // Conversación (get-or-create).
    let { data: conv } = await supabase
      .from('coach_conversations')
      .select('id')
      .eq('user_id', user.id)
      .order('last_active_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conv) {
      const { data: created, error: cErr } = await supabase
        .from('coach_conversations')
        .insert({ user_id: user.id })
        .select('id')
        .single();
      if (cErr) throw new Error(`crear conversación: ${cErr.message}`);
      conv = created;
    }

    await supabase.from('coach_messages').insert({ conversation_id: conv.id, user_id: user.id, role: 'user', content: message });

    const { system, contextoDia, history } = await assembleContext(supabase, user.id, conv.id);
    const apiMessages = history.map((m) => ({ role: m.role, content: m.content }));
    if (apiMessages.length) {
      const last = apiMessages[apiMessages.length - 1];
      last.content = `${contextoDia}\n\n${last.content}`;
    } else {
      apiMessages.push({ role: 'user', content: `${contextoDia}\n\n${message}` });
    }

    // NON-STREAMING (igual patrón que /api/analyze).
    const anthropic = new Anthropic({ apiKey });
    const resp = await anthropic.messages.create({ model: COACH_MODEL, max_tokens: MAX_TOKENS, system, messages: apiMessages });
    const blocks = resp?.content || [];
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

    if (!text) {
      await safeRpc(supabase, 'reembolsar_ia', { p_request_id: requestId });
      requestId = null;
      const diag = `⚠️ Sin texto. modelo=${COACH_MODEL} · stop=${resp?.stop_reason} · bloques=[${blocks.map((b) => `${b.type}:${(b.text || '').length}`).join(', ') || 'ninguno'}]`;
      console.error('Coach vacío:', diag, 'ms=', Date.now() - t0);
      return NextResponse.json({ text: diag });
    }

    await supabase.from('coach_messages').insert({
      conversation_id: conv.id,
      user_id: user.id,
      role: 'assistant',
      content: text,
      tokens_in: resp?.usage?.input_tokens ?? null,
      tokens_out: resp?.usage?.output_tokens ?? null,
      model: COACH_MODEL,
    });
    await supabase.from('coach_conversations').update({ last_active_at: new Date().toISOString() }).eq('id', conv.id);
    requestId = null;

    return NextResponse.json({ text });
  } catch (err) {
    // CUALQUIER excepción → JSON con el error EXACTO (a la burbuja) + logs de Vercel.
    console.error('Coach EXCEPCION:', err?.name, err?.status, err?.message, 'ms=', Date.now() - t0);
    if (supabase && requestId) await safeRpc(supabase, 'reembolsar_ia', { p_request_id: requestId });
    const authHint = err?.status === 401 ? ' (auth)' : '';
    const diag = `⚠️ ${err?.name || 'Error'} ${err?.status || ''}${authHint}: ${err?.message || 'desconocido'}`.trim();
    return NextResponse.json({ error: diag }, { status: 200 });
  }
}
