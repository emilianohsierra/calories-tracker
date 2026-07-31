import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assembleContext } from '@/lib/coach/context';

export const runtime = 'nodejs';
export const maxDuration = 60;

const COACH_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 800;

// Tool `responder` (Karpathy, plan/coach-salida-formato.md §4): el coach responde
// SIEMPRE con esta estructura de tarjetas — 0 Markdown crudo, 0 emojis. El frontend
// (components/coach/MessageRenderer.js) la pinta como componentes. `tool_choice` fuerza
// que el turno termine llamándola. Los números se VALIDAN contra el motor antes de pintar.
const RESPONDER_TOOL = {
  name: 'responder',
  description:
    'Emite la respuesta del coach como tarjetas para renderizar. Es la ÚNICA forma de responder al usuario: no escribas texto libre. titular = el dato que debe saber; accion = la única acción para ahora; bloques = 0 a 3 tarjetas de soporte.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['titular', 'bloques', 'accion'],
    properties: {
      titular: { type: 'string', description: '1 frase, el dato/insight clave. Sin Markdown ni emojis.' },
      bloques: {
        type: 'array',
        description: '0 a 3 tarjetas de soporte.',
        items: {
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: ['tipo', 'metrica', 'consumido', 'objetivo', 'pendiente', 'unidad'],
              properties: {
                tipo: { const: 'nutrition' },
                metrica: { type: 'string', enum: ['proteina', 'calorias', 'carbohidratos', 'grasa', 'agua', 'fibra'] },
                consumido: { type: 'number' },
                objetivo: { type: 'number' },
                pendiente: { type: 'number' },
                unidad: { type: 'string', enum: ['g', 'kcal', 'ml'] },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['tipo', 'titulo', 'kcal', 'prot_g', 'carb_g', 'gras_g', 'ingredientes', 'tiempo_min', 'costo'],
              properties: {
                tipo: { const: 'meal' },
                titulo: { type: 'string' },
                kcal: { type: 'number' },
                prot_g: { type: 'number' },
                carb_g: { type: 'number' },
                gras_g: { type: 'number' },
                ingredientes: { type: 'array', items: { type: 'string' } },
                tiempo_min: { type: 'number' },
                costo: { type: 'string' },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['tipo', 'texto', 'motivo'],
              properties: {
                tipo: { const: 'recommendation' },
                texto: { type: 'string' },
                motivo: { type: 'string' },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['tipo', 'metrica', 'valor', 'tendencia', 'contexto'],
              properties: {
                tipo: { const: 'progress' },
                metrica: { type: 'string' },
                valor: { type: 'string' },
                tendencia: { type: 'string', enum: ['sube', 'baja', 'estable'] },
                contexto: { type: 'string' },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['tipo', 'cuando', 'timing', 'sugerencia'],
              properties: {
                tipo: { const: 'workout' },
                cuando: { type: 'string' },
                timing: { type: 'string' },
                sugerencia: { type: 'string' },
              },
            },
          ],
        },
      },
      accion: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'accion', 'ref'],
        properties: {
          label: { type: 'string', description: 'Texto del botón. "" si accion=ninguna.' },
          accion: {
            type: 'string',
            enum: ['registrar_texto', 'registrar_foto', 'generar_cena', 'cambiar_plan', 'lista_super', 'actualizar_agua', 'ver_progreso', 'ninguna'],
          },
          ref: { type: 'string', description: 'Contexto para la acción (p.ej. "cena"). "" si no aplica.' },
        },
      },
    },
  },
};

const OUTPUT_RULES = `\n\n# CÓMO RESPONDES (formato de salida)
- Respondes SIEMPRE llamando a la herramienta \`responder\`. NO escribas texto libre ni Markdown ni emojis: la app pinta tus tarjetas.
- titular = el DATO que la persona debe saber (1 frase). accion = UNA sola acción para ahora; si no aplica, accion="ninguna" y label="".
- bloques = 0 a 3 tarjetas de soporte. Usa SOLO números reales del <contexto_dia> o las metas del motor; nunca los inventes.
- Primero el dato (titular), luego una acción. Sin párrafos largos ni frases de ánimo vacías.`;

// Validación §4.2 (motor manda): forma segura de la respuesta antes de pintar.
// - Recorta bloques a 3. - En nutrition recomputa pendiente = objetivo − consumido (≥0).
// - Garantiza titular/accion presentes. Nunca deja pasar formas inválidas al cliente.
function normalizeResponse(input) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const titular = typeof input?.titular === 'string' ? input.titular.trim() : '';
  const rawBloques = Array.isArray(input?.bloques) ? input.bloques.slice(0, 3) : [];
  const bloques = rawBloques
    .filter((b) => b && typeof b === 'object' && typeof b.tipo === 'string')
    .map((b) => {
      if (b.tipo === 'nutrition') {
        const consumido = num(b.consumido);
        const objetivo = num(b.objetivo);
        return {
          tipo: 'nutrition',
          metrica: String(b.metrica || ''),
          consumido,
          objetivo,
          pendiente: Math.max(0, Math.round(objetivo - consumido)),
          unidad: String(b.unidad || ''),
        };
      }
      return b;
    });
  const a = input?.accion && typeof input.accion === 'object' ? input.accion : {};
  const accion = {
    label: typeof a.label === 'string' ? a.label : '',
    accion: typeof a.accion === 'string' ? a.accion : 'ninguna',
    ref: typeof a.ref === 'string' ? a.ref : '',
  };
  return { titular, bloques, accion };
}

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

    // NON-STREAMING (igual patrón que /api/analyze). El coach responde SIEMPRE vía la
    // tool `responder` (tool_choice la fuerza) → estructura de tarjetas, 0 Markdown crudo.
    const anthropic = new Anthropic({ apiKey });
    const resp = await anthropic.messages.create({
      model: COACH_MODEL,
      max_tokens: MAX_TOKENS,
      system: `${system}${OUTPUT_RULES}`,
      tools: [RESPONDER_TOOL],
      tool_choice: { type: 'tool', name: 'responder' },
      messages: apiMessages,
    });
    const blocks = resp?.content || [];
    const toolBlock = blocks.find((b) => b.type === 'tool_use' && b.name === 'responder');

    let response = null;
    if (toolBlock && toolBlock.input && typeof toolBlock.input === 'object') {
      response = normalizeResponse(toolBlock.input);
    } else {
      // Fallback §4.2.4: el modelo emitió texto libre en vez de llamar `responder`.
      // Envolverlo en una respuesta mínima válida (NUNCA pintar Markdown crudo).
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      if (text) {
        response = { titular: text.slice(0, 280), bloques: [], accion: { label: '', accion: 'ninguna', ref: '' } };
      }
    }

    if (!response || !response.titular) {
      await safeRpc(supabase, 'reembolsar_ia', { p_request_id: requestId });
      requestId = null;
      const diag = `⚠️ Sin respuesta. modelo=${COACH_MODEL} · stop=${resp?.stop_reason} · bloques=[${blocks.map((b) => b.type).join(', ') || 'ninguno'}]`;
      console.error('Coach vacío:', diag, 'ms=', Date.now() - t0);
      return NextResponse.json({ error: diag }, { status: 200 });
    }

    // Se persiste la respuesta estructurada como JSON en content; el renderer la parsea.
    const stored = JSON.stringify(response);
    await supabase.from('coach_messages').insert({
      conversation_id: conv.id,
      user_id: user.id,
      role: 'assistant',
      content: stored,
      tokens_in: resp?.usage?.input_tokens ?? null,
      tokens_out: resp?.usage?.output_tokens ?? null,
      model: COACH_MODEL,
    });
    await supabase.from('coach_conversations').update({ last_active_at: new Date().toISOString() }).eq('id', conv.id);
    requestId = null;

    return NextResponse.json({ response });
  } catch (err) {
    // CUALQUIER excepción → JSON con el error EXACTO (a la burbuja) + logs de Vercel.
    console.error('Coach EXCEPCION:', err?.name, err?.status, err?.message, 'ms=', Date.now() - t0);
    if (supabase && requestId) await safeRpc(supabase, 'reembolsar_ia', { p_request_id: requestId });
    const authHint = err?.status === 401 ? ' (auth)' : '';
    const diag = `⚠️ ${err?.name || 'Error'} ${err?.status || ''}${authHint}: ${err?.message || 'desconocido'}`.trim();
    return NextResponse.json({ error: diag }, { status: 200 });
  }
}
