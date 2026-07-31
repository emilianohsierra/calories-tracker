import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assembleContext } from '@/lib/coach/context';

export const runtime = 'nodejs'; // streaming + SDK Anthropic

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const MAX_TOKENS = 600;

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

  // --- CAP DE COSTO DURO: reserva atómica (Free=cap/mes, Pro ilimitado, airbag global,
  //     kill-switch), leída de app_config server-side. Los 4 tonos NO se capean. ---
  const requestId = crypto.randomUUID();
  const { data: gate, error: gErr } = await supabase.rpc('consumir_ia', {
    p_request_id: requestId,
    p_feature: 'chat',
  });
  if (gErr || !gate) {
    console.error('Error consumir_ia:', gErr);
    return NextResponse.json({ error: 'No se pudo verificar tu cuota del coach.' }, { status: 500 });
  }
  if (!gate.allowed) {
    if (gate.reason === 'free_limit') {
      return NextResponse.json(
        { error: 'Llegaste a tus preguntas gratis del coach este mes.', reason: 'free_limit', remaining: 0 },
        { status: 402 }
      );
    }
    // kill_switch / global_cap / config_missing → mensaje genérico + reason para diagnóstico
    return NextResponse.json(
      { error: 'El coach no está disponible por el momento.', reason: gate.reason },
      { status: 503 }
    );
  }

  // --- Conversación (get-or-create; 1 hilo por usuario en F1) ---
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
      console.error('Error al crear conversación:', cErr);
      await supabase.rpc('reembolsar_ia', { p_request_id: requestId }).catch(() => {});
      return NextResponse.json({ error: 'No se pudo abrir el coach' }, { status: 500 });
    }
    conv = created;
  }

  await supabase.from('coach_messages').insert({
    conversation_id: conv.id,
    user_id: user.id,
    role: 'user',
    content: message,
  });

  const { system, contextoDia, history } = await assembleContext(supabase, user.id, conv.id);

  // El <contexto_dia> volátil se antepone al ÚLTIMO turno de usuario (preserva la caché).
  const apiMessages = history.map((m) => ({ role: m.role, content: m.content }));
  if (apiMessages.length) {
    const last = apiMessages[apiMessages.length - 1];
    last.content = `${contextoDia}\n\n${last.content}`;
  } else {
    apiMessages.push({ role: 'user', content: `${contextoDia}\n\n${message}` });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let full = '';
      try {
        const msgStream = anthropic.messages.stream({ model: MODEL, max_tokens: MAX_TOKENS, system, messages: apiMessages });
        msgStream.on('text', (t) => {
          full += t;
          controller.enqueue(encoder.encode(t));
        });
        const finalMsg = await msgStream.finalMessage();
        // Robustez: si el streaming de deltas no emitió texto, tomarlo del mensaje final.
        if (!full) {
          const blocks = finalMsg?.content || [];
          const finalText = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
          if (finalText) {
            full = finalText;
            controller.enqueue(encoder.encode(finalText));
          } else {
            // DIAGNÓSTICO TEMPORAL: por qué vuelve vacío (a pantalla + logs de Vercel).
            const diag = `⚠️ Sin texto de la IA. modelo=${MODEL} · stop=${finalMsg?.stop_reason} · bloques=[${blocks.map((b) => `${b.type}:${(b.text || '').length}`).join(', ') || 'ninguno'}] · msgs=${apiMessages.length} · roles=${apiMessages.map((m) => m.role).join('>')} · usage=${JSON.stringify(finalMsg?.usage || {})}`;
            console.error('Coach vacío:', diag);
            full = diag;
            controller.enqueue(encoder.encode(diag));
          }
        }
        await supabase.from('coach_messages').insert({
          conversation_id: conv.id,
          user_id: user.id,
          role: 'assistant',
          content: full,
          tokens_in: finalMsg?.usage?.input_tokens ?? null,
          tokens_out: finalMsg?.usage?.output_tokens ?? null,
          model: MODEL,
        });
        await supabase
          .from('coach_conversations')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', conv.id);
      } catch (err) {
        console.error('Error en el stream del coach:', err);
        // Fallo SIN salida → reembolsar el crédito reservado (no hubo respuesta).
        if (!full) {
          await supabase.rpc('reembolsar_ia', { p_request_id: requestId }).catch(() => {});
          // DIAGNÓSTICO TEMPORAL: mostrar el error real de la API en pantalla.
          const diag = `⚠️ Error IA: ${err?.status || ''} ${err?.name || ''} ${err?.message || 'desconocido'}`.trim();
          controller.enqueue(encoder.encode(diag));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
