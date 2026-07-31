import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assembleContext } from '@/lib/coach/context';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Chat FORZADO a Haiku (rápido), independiente de ANTHROPIC_MODEL (que analyze puede
// tener apuntando a un modelo más lento). Respuesta corta → completa en ~3-5s, sin timeout.
const COACH_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 800;

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
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
  const requestId = crypto.randomUUID();
  const { data: gate, error: gErr } = await supabase.rpc('consumir_ia', { p_request_id: requestId, p_feature: 'chat' });
  if (gErr || !gate) {
    console.error('Error consumir_ia:', gErr);
    return NextResponse.json({ error: 'No se pudo verificar tu cuota del coach.' }, { status: 500 });
  }
  if (!gate.allowed) {
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
    if (cErr) {
      await supabase.rpc('reembolsar_ia', { p_request_id: requestId }).catch(() => {});
      return NextResponse.json({ error: 'No se pudo abrir el coach' }, { status: 500 });
    }
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

  // NON-STREAMING (mismo patrón que /api/analyze, fiable en serverless). Haiku + 800 tok
  // completa rápido y evita el timeout; el streaming en Vercel queda como follow-up.
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const resp = await anthropic.messages.create({ model: COACH_MODEL, max_tokens: MAX_TOKENS, system, messages: apiMessages });
    const blocks = resp?.content || [];
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

    if (!text) {
      // Sin respuesta real → REEMBOLSAR (no quemar cuota) + diagnóstico a pantalla.
      await supabase.rpc('reembolsar_ia', { p_request_id: requestId }).catch(() => {});
      const diag = `⚠️ Sin texto. modelo=${COACH_MODEL} · stop=${resp?.stop_reason} · bloques=[${blocks.map((b) => `${b.type}:${(b.text || '').length}`).join(', ') || 'ninguno'}] · roles=${apiMessages.map((m) => m.role).join('>')}`;
      console.error('Coach vacío:', diag);
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

    return NextResponse.json({ text });
  } catch (err) {
    console.error('Error IA coach:', err);
    await supabase.rpc('reembolsar_ia', { p_request_id: requestId }).catch(() => {});
    const diag = `⚠️ Error IA: ${err?.status || ''} ${err?.name || ''} ${err?.message || 'desconocido'}`.trim();
    return NextResponse.json({ error: diag }, { status: 502 });
  }
}
