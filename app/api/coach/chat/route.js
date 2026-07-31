import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assembleContext } from '@/lib/coach/context';
import { registrarComidaFoto, registrarTexto } from '@/lib/coach/actions';

export const runtime = 'nodejs';
export const maxDuration = 60;

const COACH_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 800;
// Tool-use = varias vueltas a Anthropic. Topes para NO pasarnos del límite serverless.
const MAX_STEPS = 4;
const TIME_BUDGET_MS = 45000;

// Tool `registrar_comida_foto` (Karpathy §4.2): registra una comida a partir de un
// análisis de foto ya realizado (reusa /api/analyze en cliente + /api/meals en backend).
// Solo se ofrece cuando el request trae un análisis pendiente.
const REGISTRAR_FOTO_TOOL = {
  name: 'registrar_comida_foto',
  description:
    'Registra una comida a partir de un análisis de foto ya realizado. Úsala solo cuando exista un análisis pendiente (analisis_id="foto") y la persona quiera guardarlo. Los macros salen del análisis, no los inventes.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['analisis_id', 'momento', 'correccion'],
    properties: {
      analisis_id: { type: 'string', description: 'Usa "foto" para el análisis pendiente del turno.' },
      momento: { type: 'string', enum: ['desayuno', 'comida', 'cena', 'snack'] },
      correccion: { type: 'string', description: 'Corrección opcional de la persona. "" si registra tal cual.' },
    },
  },
};

// Tool `registrar_texto` (Karpathy §4.3): registrar una comida descrita en lenguaje
// natural. El backend ESTIMA los macros (grounding) y PROPONE; la mutación real ocurre en
// UI al confirmar (POST /api/meals). Disponible en todo turno (la persona puede contar
// lo que comió en cualquier momento).
const REGISTRAR_TEXTO_TOOL = {
  name: 'registrar_texto',
  description:
    'Registra una comida que la persona describe en texto (lo que YA comió). Úsala solo cuando cuente una comida y quiera registrarla, no en charla general. El backend estima los macros; no los inventes tú.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['descripcion', 'momento'],
    properties: {
      descripcion: { type: 'string' },
      momento: { type: 'string', enum: ['desayuno', 'comida', 'cena', 'snack'] },
    },
  },
};

// Sanea el análisis pendiente que manda el cliente (viene de /api/analyze; son datos del
// propio usuario, pero se acotan). Devuelve null si no es utilizable.
function sanitizePendingAnalysis(p) {
  if (!p || typeof p !== 'object') return null;
  const numOr0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const titulo = String(p.titulo || '').trim().slice(0, 120);
  if (!titulo) return null;
  return {
    titulo,
    descripcion: String(p.descripcion || '').slice(0, 600),
    tipo_comida: String(p.tipo_comida || ''),
    calorias: numOr0(p.calorias),
    proteinas_g: numOr0(p.proteinas_g),
    carbohidratos_g: numOr0(p.carbohidratos_g),
    grasas_g: numOr0(p.grasas_g),
    ingredientes: Array.isArray(p.ingredientes) ? p.ingredientes.slice(0, 20).map((s) => String(s).slice(0, 60)) : [],
    confianza: String(p.confianza || '').slice(0, 10),
    imagen: String(p.imagen || '').replace(/[^a-zA-Z0-9.-]/g, ''),
  };
}

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
    const pendingAnalysis = sanitizePendingAnalysis(body?.pendingAnalysis);

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

    const { system, contextoDia, history, ctx } = await assembleContext(supabase, user.id, conv.id);
    const apiMessages = history.map((m) => ({ role: m.role, content: m.content }));
    // Nota volátil de análisis pendiente (va con el turno del usuario, tras la caché).
    const analisisNota = pendingAnalysis
      ? `\n<analisis_pendiente>Hay un análisis de foto listo para registrar (analisis_id="foto"): "${pendingAnalysis.titulo}" · ${Math.round(pendingAnalysis.calorias)} kcal · P ${Math.round(pendingAnalysis.proteinas_g)} g. Si la persona confirma, llama registrar_comida_foto; si no, pregúntale.</analisis_pendiente>`
      : '';
    const volatile = `${contextoDia}${analisisNota}`;
    if (apiMessages.length) {
      const last = apiMessages[apiMessages.length - 1];
      last.content = `${volatile}\n\n${last.content}`;
    } else {
      apiMessages.push({ role: 'user', content: `${volatile}\n\n${message}` });
    }

    // LOOP DE TOOL-USE (non-streaming, Haiku, max_tokens acotado). El coach ejecuta
    // acciones (reusando lo existente) y CIERRA el turno con la tool `responder`.
    // Topes duros (MAX_STEPS + TIME_BUDGET_MS) para no pasarnos del límite serverless.
    const anthropic = new Anthropic({ apiKey });
    // registrar_texto disponible en todo turno; registrar_comida_foto solo con foto
    // pendiente. tool_choice auto (el modelo decide). El chat charla = 1 vuelta (responder).
    let tools = pendingAnalysis
      ? [REGISTRAR_FOTO_TOOL, REGISTRAR_TEXTO_TOOL, RESPONDER_TOOL]
      : [REGISTRAR_TEXTO_TOOL, RESPONDER_TOOL];
    let choice = { type: 'auto' };
    let convo = apiMessages;
    let responderInput = null;
    let guardado = null; // foto registrada
    let estimate = null; // comida estimada por texto (propuesta, aún sin escribir)
    let lastResp = null;

    for (let step = 0; step < MAX_STEPS; step++) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break; // corte con gracia
      lastResp = await anthropic.messages.create({
        model: COACH_MODEL,
        max_tokens: MAX_TOKENS,
        system: `${system}${OUTPUT_RULES}`,
        tools,
        tool_choice: choice,
        messages: convo,
      });
      const blocks = lastResp?.content || [];
      const toolUses = blocks.filter((b) => b.type === 'tool_use');

      // Una sola acción por turno (foto tiene prioridad si hay análisis pendiente).
      const canAct = !guardado && !estimate;
      const fotoAction = canAct && pendingAnalysis ? toolUses.find((b) => b.name === 'registrar_comida_foto') : null;
      const textoAction = canAct && !fotoAction ? toolUses.find((b) => b.name === 'registrar_texto') : null;
      const action = fotoAction || textoAction;
      if (action) {
        let exec;
        if (fotoAction) {
          exec = await registrarComidaFoto({ supabase, userId: user.id, input: action.input || {}, analysis: pendingAnalysis, ctx });
          if (exec.guardado) guardado = exec.guardado;
        } else {
          exec = await registrarTexto({ anthropic, model: COACH_MODEL, input: action.input || {}, ctx });
          if (exec.estimate) estimate = exec.estimate;
        }
        // Solo se devuelve tool_result para ESTA tool_use (se descartan otras del turno
        // para no dejar tool_use sin respuesta → evita 400 en la vuelta siguiente).
        const assistantContent = blocks.filter((b) => b.type === 'text' || (b.type === 'tool_use' && b.id === action.id));
        convo = [
          ...convo,
          { role: 'assistant', content: assistantContent },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: action.id, content: JSON.stringify(exec.toolResult) }] },
        ];
        // Tras actuar: forzar cierre con responder (sin re-ofrecer tools → sin repetición).
        tools = [RESPONDER_TOOL];
        choice = { type: 'tool', name: 'responder' };
        continue;
      }

      const responderCall = toolUses.find((b) => b.name === 'responder');
      if (responderCall && responderCall.input && typeof responderCall.input === 'object') {
        responderInput = responderCall.input;
        break;
      }

      // Sin tool_use útil: envolver texto libre como responder (nunca Markdown crudo).
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      if (text) responderInput = { titular: text.slice(0, 280), bloques: [], accion: { label: '', accion: 'ninguna', ref: '' } };
      break;
    }

    let response = responderInput ? normalizeResponse(responderInput) : null;
    // Si registramos foto pero el modelo no cerró con responder (p.ej. corte por tiempo),
    // sintetizamos una confirmación con números del backend (no del modelo).
    if ((!response || !response.titular) && guardado) {
      response = {
        titular: `Registré ${guardado.titulo}: ${Math.round(guardado.kcal)} kcal.`,
        bloques: [],
        accion: { label: '', accion: 'ninguna', ref: '' },
      };
    }
    // Propuesta por texto: se FUERZA el bloque meal con NÚMEROS DEL BACKEND (estimación),
    // no los que pudiera reescribir el modelo. La MealCard confirma → POST /api/meals.
    if (estimate) {
      if (!response || !response.titular) {
        response = { titular: `Estimé "${estimate.titulo}". Confírmalo para registrarlo.`, bloques: [], accion: { label: '', accion: 'ninguna', ref: '' } };
      }
      response.bloques = [
        {
          tipo: 'meal',
          titulo: estimate.titulo,
          kcal: estimate.kcal,
          prot_g: estimate.prot_g,
          carb_g: estimate.carb_g,
          gras_g: estimate.gras_g,
          ingredientes: estimate.ingredientes,
          tiempo_min: 0,
          costo: '',
        },
      ];
    }

    if (!response || !response.titular) {
      // Nada útil y NO hubo mutación → reembolso (no cobrar un turno sin valor).
      await safeRpc(supabase, 'reembolsar_ia', { p_request_id: requestId });
      requestId = null;
      const diag = `⚠️ Sin respuesta. modelo=${COACH_MODEL} · stop=${lastResp?.stop_reason} · pasos_agotados`;
      console.error('Coach vacío:', diag, 'ms=', Date.now() - t0);
      return NextResponse.json({ error: diag }, { status: 200 });
    }

    const resp = lastResp;

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

    return NextResponse.json({ response, registered: !!guardado });
  } catch (err) {
    // CUALQUIER excepción → JSON con el error EXACTO (a la burbuja) + logs de Vercel.
    console.error('Coach EXCEPCION:', err?.name, err?.status, err?.message, 'ms=', Date.now() - t0);
    if (supabase && requestId) await safeRpc(supabase, 'reembolsar_ia', { p_request_id: requestId });
    const authHint = err?.status === 401 ? ' (auth)' : '';
    const diag = `⚠️ ${err?.name || 'Error'} ${err?.status || ''}${authHint}: ${err?.message || 'desconocido'}`.trim();
    return NextResponse.json({ error: diag }, { status: 200 });
  }
}
