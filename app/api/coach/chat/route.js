import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assembleContext } from '@/lib/coach/context';
import { registrarComidaFoto, registrarTexto, actualizarContextoDia, generarCena, cambiarObjetivo, guardarMemoria, agregarAListaCompras, sugerirSustitucion } from '@/lib/coach/actions';
import { intentListaCompras, intentArmarLista, extraerItemsLista } from '@/lib/coach/intent';
import { escribirLista } from '@/lib/pantry/shopping';
import { limitPayload } from '@/lib/paywall';
import { nextResetLabel } from '@/lib/usage';

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

// Tool `generar_cena` (Karpathy §4.1): sugiere 1–3 opciones que cierran los pendientes.
// El backend genera (grounding) y FILTRA alérgenos en código; propone como MealCards.
const GENERAR_CENA_TOOL = {
  name: 'generar_cena',
  description:
    'Sugiere 1 a 3 opciones de comida que cierran los macros pendientes del día, respetando restricciones y preferencias. Úsala cuando la persona pregunte qué comer o cómo cubrir lo que le falta.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['momento', 'n_opciones', 'usar_favoritos', 'ingredientes_disponibles'],
    properties: {
      momento: { type: 'string', enum: ['desayuno', 'comida', 'cena', 'snack'] },
      n_opciones: { type: 'integer', enum: [1, 2, 3] },
      usar_favoritos: { type: 'boolean' },
      ingredientes_disponibles: { type: 'array', items: { type: 'string' } },
    },
  },
};

// Tool `agregar_a_lista_compras` (Fase 7, última tool): PROPONE agregar productos a la lista de
// compras cuando la persona lo pide o hay agotados en la despensa. Números/cantidades del MOTOR
// (no inventados). PROPONE → confirma → aplica (la escritura real es el endpoint CRUD, Free).
const LISTA_COMPRAS_TOOL = {
  name: 'agregar_a_lista_compras',
  description:
    'Agrega productos a la lista de compras del usuario. LLÁMALA SIEMPRE que la persona pida anotar/agregar/comprar algo, aunque sea un solo producto y aunque no tengas más contexto. Disparadores: "anota que necesito X", "apúntame X", "apunta X", "agrégame X a la lista", "añade X a mi súper/lista", "necesito comprar X", "recuérdame comprar X", "pon X en la lista". Cada producto va en `items` como texto libre (p.ej. {"texto":"leche"}); no hace falta que exista en el catálogo. NO inventes cantidades: si la persona no la dice, se usa 1. Deja `items` vacío SOLO para auto-proponer los agotados de la despensa. NO respondas con un consejo genérico: primero agrega a la lista.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        description: 'Productos a proponer. Vacío = auto-detectar agotados de la despensa.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['texto'],
          properties: {
            texto: { type: 'string' },
            cantidad: { type: 'number' },
            unidad: { type: 'string' },
          },
        },
      },
    },
  },
};

// Tool `sugerir_sustitucion` (Fase 7): alternativas MEJORES y SEGURAS a un producto (con sellos de
// EXCESO / peor nutri-score / ausente). Los datos salen de sustituir() (motor puro + safety.js →
// SOLO SEGURO, nunca un alérgeno); el modelo solo redacta. PROPONE (no escribe).
const SUGERIR_SUSTITUCION_TOOL = {
  name: 'sugerir_sustitucion',
  description:
    'Sugiere alternativas MEJORES y seguras a un producto (sobre todo si tiene sellos de EXCESO o peor nutri-score). Úsala cuando la persona pregunte "¿hay algo mejor que X?", "¿con qué sustituyo X?" o quiera una opción más sana. Deja `producto` vacío para revisar lo peor de su despensa. NO inventes datos: si no hay mejor+segura, dilo honesto.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['producto'],
    properties: {
      producto: { type: 'string', description: 'Nombre del producto a sustituir. "" = auto (lo peor de la despensa).' },
    },
  },
};

// Tool `cambiar_plan` (Opción A del Director): cambia el OBJETIVO/coach y recalcula las
// metas con el motor. PROPONE antes→después (PlanDiff); se aplica al confirmar en UI.
// NO sugiere comidas (eso es generar_cena) ni permite override manual de macros.
const CAMBIAR_PLAN_TOOL = {
  name: 'cambiar_plan',
  description:
    'Cambia el OBJETIVO/coach del usuario y recalcula sus metas con el motor. Úsala cuando pida cambiar de objetivo (perder grasa, ganar músculo, recomposición, runner, bienestar). La proteína y las metas las fija el objetivo (motor); si pide "más proteína", ofrécele cambiar a un objetivo con más proteína. No la uses para sugerir comidas.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['objetivo', 'nota'],
    properties: {
      objetivo: { type: 'string', enum: ['perdida_grasa', 'hipertrofia', 'runner', 'recomposicion', 'bienestar'] },
      nota: { type: 'string', description: 'Lo que pidió en sus palabras (p.ej. "ganar músculo"). "" si no aplica.' },
    },
  },
};

// Tool `save_memory` (Karpathy §4.7): guarda un hecho permanente de la persona. NO para
// alergias/intolerancias (esas van a restricciones con confirmación — guard en el ejecutor).
const SAVE_MEMORY_TOOL = {
  name: 'save_memory',
  description:
    'Guarda un dato permanente de la persona para recordarlo en el futuro (favorito, rechazo, lesión, compromiso, preferencia, hecho clave). NO lo uses para alergias/intolerancias: esas se confirman y van a las restricciones duras del perfil.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['tipo', 'contenido', 'caducidad_dias'],
    properties: {
      tipo: { type: 'string', enum: ['favorito', 'rechazo', 'lesion', 'compromiso', 'preferencia', 'hecho_clave'] },
      contenido: { type: 'string' },
      caducidad_dias: { type: 'integer', description: '0 = permanente; >0 = caduca en N días (p.ej. lesión temporal).' },
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

// Tool `actualizar_contexto_dia` (Karpathy §4.5): actualiza un dato del estado de hoy
// que la persona menciona (agua, entreno, sueño, estrés, hora de comida). Escribe en
// coach_day_state. No sugiere comida → sin filtro de alérgenos.
const ACTUALIZAR_TOOL = {
  name: 'actualizar_contexto_dia',
  description:
    'Actualiza un dato del estado de HOY que la persona menciona: agua que tomó (agua_ml = ml que acaba de tomar, se suma), entreno hecho/omitido, horas de sueño, nivel de estrés, u hora de comida. Úsala solo cuando lo cuente.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['campo', 'valor'],
    properties: {
      campo: { type: 'string', enum: ['agua_ml', 'entreno_estado', 'sueno_h', 'estres', 'hora_comida'] },
      valor: { type: 'string', description: 'Valor como texto; el backend lo valida/parsea según el campo.' },
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

// Guía de ACCIONES: mapea la intención de la persona a la tool correcta. Sin esto, un modelo chico
// (Haiku) tiende a ir directo a \`responder\` con un consejo genérico y NO ejecuta la acción pedida.
const ACTIONS_GUIDE = `\n\n# ACCIONES (ejecuta la herramienta correcta ANTES de \`responder\` cuando la persona lo pida)
- LISTA DE COMPRAS → \`agregar_a_lista_compras\`: si pide anotar/agregar/comprar algo ("anota que necesito leche", "apúntame X", "agrégame X a la lista", "necesito comprar X", "pon X en el súper"). Pasa el producto como texto libre en \`items\`. NO respondas con un consejo genérico: PRIMERO agrega a la lista.
- SUSTITUCIÓN → \`sugerir_sustitucion\`: si pregunta por una mejor opción ("¿con qué sustituyo X?", "¿hay algo mejor que X?", "una opción más sana que X").
- QUÉ COMER → \`generar_cena\`. REGISTRAR comida (texto/foto) → \`registrar_texto\`/foto. Estado del día (agua/sueño/entreno) → \`actualizar_contexto_dia\`. Recordar un gusto/preferencia → \`save_memory\`. Cambiar objetivo → \`cambiar_plan\`.
- Reglas: elige la acción por lo que PIDE la persona (no por el contexto del día). Si NINGUNA acción aplica, responde directo con \`responder\`. Tras ejecutar una acción, cierra el turno con \`responder\`.`;

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
      // T2 (Drucker paywall-triggers §4): agotó la degustación del coach → 429 variant limit.
      // El chequeo va ANTES de llamar al modelo (no gastar la llamada). Backend = fuente de
      // verdad; el copy lo pone el UpgradeModal. Otros motivos (kill_switch/cap global) = 503.
      if (gate.reason === 'free_limit') {
        const cap = Number(process.env.FREE_COACH_LIMIT) || 3; // solo display; enforcement real = app_config
        return NextResponse.json(
          {
            error: 'Llegaste a tus preguntas gratis del coach este mes.',
            ...limitPayload({ feature: 'coach_chat', usage: { plan: 'free', used: cap, cap, remaining: 0, resetLabel: nextResetLabel() } }),
          },
          { status: 429 }
        );
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

    // ── Fase 7 · short-circuit DETERMINISTA de lista (sin modelo; Haiku no es fiable eligiendo tool) ─
    //  · "anota que necesito leche" (item puntual) → extrae, filtra alérgenos y ESCRIBE.
    //  · "arma mi lista del súper"  (armar)         → AUTO: agotados de la despensa (motor) y ESCRIBE.
    // NUNCA un briefing genérico. Acción sin IA → REEMBOLSA el turno (Free) + guarda en historial.
    //
    // DECISIÓN DE DISEÑO (Item 11 del backlog QA): el fast-path ESCRIBE de una vez en vez de
    // proponer-y-confirmar. Es intencional y seguro:
    //   1) El cinturón de alérgenos vive DENTRO (agregarAListaCompras → filtra antes de escribir),
    //      así que nunca se anota algo inseguro para el usuario.
    //   2) La lista de compras es reversible con un tap (quitar en /lista), a diferencia de registrar
    //      una comida o cambiar el plan — el costo de un error es ~0.
    //   3) Menos fricción: "anota leche" pone leche, no abre un diálogo de confirmación.
    // Si algún día la acción dejara de ser trivialmente reversible, revertir a proponer-confirmar.
    const quiereArmar = !pendingAnalysis && intentArmarLista(message) && !intentListaCompras(message);
    const quiereAnotar = !pendingAnalysis && intentListaCompras(message);
    if (quiereArmar || quiereAnotar) {
      const responder = async (response, extra = {}) => {
        await supabase.from('coach_messages').insert({ conversation_id: conv.id, user_id: user.id, role: 'assistant', content: JSON.stringify(response) });
        await safeRpc(supabase, 'reembolsar_ia', { p_request_id: requestId }); // sin IA → Free
        requestId = null;
        return NextResponse.json({ response, coachRemaining: null, ...extra });
      };
      // AUTO (agotados) para "armar"; extracción del texto para "anotar".
      const input = quiereArmar ? { items: [] } : { items: extraerItemsLista(message).map((t) => ({ texto: t })) };
      const puedeProceder = quiereArmar || input.items.length; // "anota" sin ítem claro → cae al tool-loop
      if (puedeProceder) {
        const exec = await agregarAListaCompras({ input, ctx }); // filtra alérgenos (belt)
        const propuesta = exec.listaCompras || [];
        if (propuesta.length) {
          const escritos = await escribirLista(supabase, user.id, propuesta);
          const nombres = escritos.map((x) => x.texto).filter(Boolean).join(', ');
          if (escritos.length) {
            const titular = quiereArmar
              ? `Armé tu lista con lo que tienes agotado: ${nombres}. Puedes agregar más cuando quieras.`
              : `Listo, agregué ${nombres} a tu lista de compras.`;
            return responder({ titular, bloques: [], accion: { label: 'Ver mi lista', accion: 'lista_super', ref: '' } }, { listaEscrita: escritos });
          }
          return responder({ titular: 'No pude agregarlo a la lista. Intenta de nuevo.', bloques: [], accion: { label: '', accion: 'ninguna', ref: '' } });
        }
        // Sin propuesta → honesto, NUNCA briefing.
        const titular = quiereArmar
          ? 'No veo productos agotados en tu despensa para armar la lista. Dime qué necesitas y lo anoto.'
          : 'No lo agregué: eso está en tus alergias declaradas.';
        return responder({ titular, bloques: [], accion: { label: quiereArmar ? 'Ver mi lista' : '', accion: quiereArmar ? 'lista_super' : 'ninguna', ref: '' } });
      }
    }

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
    const baseTools = [REGISTRAR_TEXTO_TOOL, ACTUALIZAR_TOOL, GENERAR_CENA_TOOL, CAMBIAR_PLAN_TOOL, SAVE_MEMORY_TOOL, LISTA_COMPRAS_TOOL, SUGERIR_SUSTITUCION_TOOL, RESPONDER_TOOL];
    let tools = pendingAnalysis ? [REGISTRAR_FOTO_TOOL, ...baseTools] : baseTools;
    // Cinturón determinista (bugfix Fase 7): si el mensaje pide CLARAMENTE anotar/comprar algo,
    // FORZAMOS la tool de lista (Haiku a veces no la elige y cae a un consejo genérico). Excepto si
    // hay una foto pendiente (esa tiene prioridad). El modelo extrae el/los ítems del mensaje.
    let choice = !pendingAnalysis && intentListaCompras(message)
      ? { type: 'tool', name: 'agregar_a_lista_compras' }
      : { type: 'auto' };
    let convo = apiMessages;
    let responderInput = null;
    let guardado = null; // foto registrada
    let estimate = null; // comida estimada por texto (propuesta, aún sin escribir)
    let actualizado = null; // estado del día actualizado
    let opciones = null; // opciones de generar_cena (propuestas, sin escribir)
    let planChange = null; // propuesta de cambio de objetivo (sin escribir)
    let memoria = null; // hecho guardado en memoria
    let listaCompras = null; // ítems ESCRITOS en la lista por el path tool-loop (B3: se persiste antes de navegar)
    let sustituciones = null; // alternativas propuestas (sin escribir)
    let lastResp = null;

    for (let step = 0; step < MAX_STEPS; step++) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break; // corte con gracia
      lastResp = await anthropic.messages.create({
        model: COACH_MODEL,
        max_tokens: MAX_TOKENS,
        system: `${system}${OUTPUT_RULES}${ACTIONS_GUIDE}`,
        tools,
        tool_choice: choice,
        messages: convo,
      });
      const blocks = lastResp?.content || [];
      const toolUses = blocks.filter((b) => b.type === 'tool_use');

      // Una sola acción por turno (foto tiene prioridad si hay análisis pendiente).
      const canAct = !guardado && !estimate && !actualizado && !opciones && !planChange && !memoria && !listaCompras && !sustituciones;
      const fotoAction = canAct && pendingAnalysis ? toolUses.find((b) => b.name === 'registrar_comida_foto') : null;
      const textoAction = canAct && !fotoAction ? toolUses.find((b) => b.name === 'registrar_texto') : null;
      const cenaAction = canAct && !fotoAction && !textoAction ? toolUses.find((b) => b.name === 'generar_cena') : null;
      const planAction = canAct && !fotoAction && !textoAction && !cenaAction ? toolUses.find((b) => b.name === 'cambiar_plan') : null;
      const ctxAction = canAct && !fotoAction && !textoAction && !cenaAction && !planAction ? toolUses.find((b) => b.name === 'actualizar_contexto_dia') : null;
      const memAction = canAct && !fotoAction && !textoAction && !cenaAction && !planAction && !ctxAction ? toolUses.find((b) => b.name === 'save_memory') : null;
      const listaAction = canAct && !fotoAction && !textoAction && !cenaAction && !planAction && !ctxAction && !memAction ? toolUses.find((b) => b.name === 'agregar_a_lista_compras') : null;
      const sustAction = canAct && !fotoAction && !textoAction && !cenaAction && !planAction && !ctxAction && !memAction && !listaAction ? toolUses.find((b) => b.name === 'sugerir_sustitucion') : null;
      const action = fotoAction || textoAction || cenaAction || planAction || ctxAction || memAction || listaAction || sustAction;
      if (action) {
        let exec;
        if (fotoAction) {
          exec = await registrarComidaFoto({ supabase, userId: user.id, input: action.input || {}, analysis: pendingAnalysis, ctx });
          if (exec.guardado) guardado = exec.guardado;
        } else if (textoAction) {
          exec = await registrarTexto({ anthropic, model: COACH_MODEL, input: action.input || {}, ctx });
          if (exec.estimate) estimate = exec.estimate;
        } else if (cenaAction) {
          exec = await generarCena({ anthropic, model: COACH_MODEL, input: action.input || {}, ctx });
          if (exec.opciones) opciones = exec.opciones;
        } else if (planAction) {
          exec = cambiarObjetivo({ ctx, input: action.input || {} });
          if (exec.planChange) planChange = exec.planChange;
        } else if (ctxAction) {
          exec = await actualizarContextoDia({ supabase, userId: user.id, input: action.input || {} });
          if (exec.estado) actualizado = exec.estado;
        } else if (memAction) {
          exec = await guardarMemoria({ supabase, userId: user.id, input: action.input || {} });
          if (exec.memoria) memoria = exec.memoria;
        } else if (listaAction) {
          // B3 (Nielsen): el path del tool-loop TAMBIÉN escribe (belt de alérgeno dentro de
          // agregarAListaCompras), consistente con el short-circuit. Nunca navegar a /lista con una
          // propuesta SIN persistir (antes se perdía y la lista quedaba vacía).
          exec = await agregarAListaCompras({ input: action.input || {}, ctx });
          const propuesta = exec.listaCompras || [];
          if (propuesta.length) {
            const escritos = await escribirLista(supabase, user.id, propuesta);
            if (escritos.length) listaCompras = escritos; // ya ESCRITO (no solo propuesto)
            exec.toolResult = { ...exec.toolResult, escrito: escritos.length };
          }
        } else {
          exec = sugerirSustitucion({ input: action.input || {}, ctx });
          if (exec.sustituciones) sustituciones = exec.sustituciones;
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
    // Opciones de generar_cena: se FUERZAN como bloques meal con NÚMEROS DEL BACKEND
    // (grounding filtrado por alérgenos), no los que reescribiera el modelo. Cada MealCard
    // se registra al confirmar → POST /api/meals.
    if (opciones && opciones.length) {
      if (!response || !response.titular) {
        response = { titular: 'Opciones que cierran tus pendientes de hoy:', bloques: [], accion: { label: '', accion: 'ninguna', ref: '' } };
      }
      response.bloques = opciones.slice(0, 3).map((o) => ({
        tipo: 'meal',
        titulo: o.titulo,
        kcal: o.kcal,
        prot_g: o.prot_g,
        carb_g: o.carb_g,
        gras_g: o.gras_g,
        ingredientes: o.ingredientes,
        tiempo_min: o.tiempo_min,
        costo: o.costo,
      }));
    }
    // Propuesta de cambio de objetivo: el titular lo pone el modelo (o se sintetiza); el
    // antes→después lo pinta el cliente con PlanDiff desde planChange (números del motor).
    if (planChange && (!response || !response.titular)) {
      response = { titular: 'Así quedaría tu plan con ese objetivo. ¿Lo aplico?', bloques: [], accion: { label: '', accion: 'ninguna', ref: '' } };
    }
    // Estado del día actualizado sin cierre de responder → confirmación mínima.
    if ((!response || !response.titular) && actualizado) {
      response = { titular: 'Anotado.', bloques: [], accion: { label: '', accion: 'ninguna', ref: '' } };
    }
    // Memoria guardada sin cierre de responder → confirmación mínima.
    if ((!response || !response.titular) && memoria) {
      response = { titular: `Lo recordaré: ${memoria.contenido}.`, bloques: [], accion: { label: '', accion: 'ninguna', ref: '' } };
    }
    // Propuesta de lista de compras (números del motor): titular + botón para confirmar/agregar.
    if ((!response || !response.titular) && listaCompras) {
      // Ya está ESCRITO (B3): el titular lo confirma y el botón navega a la lista real.
      const nombres = listaCompras.slice(0, 3).map((x) => x.texto).filter(Boolean).join(', ');
      response = { titular: `Listo, agregué ${nombres} a tu lista de compras.`, bloques: [], accion: { label: 'Ver mi lista', accion: 'lista_super', ref: '' } };
    }
    // Sustituciones (datos del motor + safety): tarjetas recommendation (nombre + razón grounded).
    if ((!response || !response.titular) && sustituciones && sustituciones.length) {
      response = {
        titular: 'Mejores alternativas de tu despensa:',
        bloques: sustituciones.slice(0, 3).map((a) => ({ tipo: 'recommendation', texto: a.nombre, motivo: a.razon })),
        accion: { label: '', accion: 'ninguna', ref: '' },
      };
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

    // coachRemaining (null = ilimitado/Pro; número = degustación Free restante) para que la
    // UI pinte el badge / aviso 80% (paywall-triggers §3). Lectura de consumir_ia, no lo toca.
    return NextResponse.json({ response, registered: !!guardado, planChange: planChange || null, coachRemaining: gate?.remaining ?? null });
  } catch (err) {
    // CUALQUIER excepción → JSON con el error EXACTO (a la burbuja) + logs de Vercel.
    console.error('Coach EXCEPCION:', err?.name, err?.status, err?.message, 'ms=', Date.now() - t0);
    if (supabase && requestId) await safeRpc(supabase, 'reembolsar_ia', { p_request_id: requestId });
    const authHint = err?.status === 401 ? ' (auth)' : '';
    const diag = `⚠️ ${err?.name || 'Error'} ${err?.status || ''}${authHint}: ${err?.message || 'desconocido'}`.trim();
    return NextResponse.json({ error: diag }, { status: 200 });
  }
}
