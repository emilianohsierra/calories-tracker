import Anthropic from '@anthropic-ai/sdk';

// Proveedor de IA: Claude (Anthropic). El análisis usa la Messages API con
// "tool use" para forzar una salida JSON estructurada y validada.
const PROVIDERS = {
  anthropic: {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    baseURL: undefined,
    keyEnv: 'ANTHROPIC_API_KEY',
    modelEnv: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-haiku-4-5',
    billingHint: 'console.anthropic.com → Billing',
  },
};

// AI_PROVIDER explícito manda; si no está definido (o vale "anthropic"), se usa Claude.
export function resolveProvider() {
  const explicit = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (explicit && explicit !== 'anthropic') {
    const err = new Error(
      `AI_PROVIDER="${explicit}" no es válido. Usa: ${Object.keys(PROVIDERS).join(' | ')}`
    );
    err.code = 'BAD_PROVIDER';
    err.billed = false; // se lanza antes del try/catch → sin cobro (H1)
    throw err;
  }
  return PROVIDERS.anthropic;
}

// input_schema de la tool: son EXACTAMENTE los campos que consume el resto de la app
// (app/api/analyze/route.js y components/AddMealModal.js). No renombrar sin migrar ambos.
const TOOL = {
  name: 'registrar_analisis',
  description:
    'Registra el análisis nutricional estimado del platillo de la fotografía, en español.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      es_comida: {
        type: 'boolean',
        description: 'true solo si la imagen muestra comida o bebida consumible',
      },
      titulo: { type: 'string', description: 'Nombre corto y apetitoso del platillo, en español' },
      descripcion: {
        type: 'string',
        description: 'Descripción de 1-2 frases del platillo y sus componentes visibles, en español',
      },
      tipo_comida: { type: 'string', enum: ['desayuno', 'comida', 'cena', 'snack'] },
      calorias: { type: 'integer', description: 'Calorías totales estimadas (kcal) de la porción visible' },
      proteinas_g: { type: 'number', description: 'Gramos de proteína estimados' },
      carbohidratos_g: { type: 'number', description: 'Gramos de carbohidratos estimados' },
      grasas_g: { type: 'number', description: 'Gramos de grasa estimados' },
      confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
      ingredientes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ingredientes o componentes principales visibles',
      },
    },
    required: [
      'es_comida',
      'titulo',
      'descripcion',
      'tipo_comida',
      'calorias',
      'proteinas_g',
      'carbohidratos_g',
      'grasas_g',
      'confianza',
      'ingredientes',
    ],
  },
};

const MEAL_TYPES = ['desayuno', 'comida', 'cena', 'snack'];
const CONFIDENCE = ['alta', 'media', 'baja'];

// El tool use de Anthropic es "best-effort": Haiku podría omitir un campo o salirse de
// un enum y romper la UI (components/AddMealModal.js). Anthropic soporta strict:true solo
// en modelos recientes (Haiku 4.5, Opus 4.8, Sonnet 5), así que enviarlo a ciegas rompería
// con un ANTHROPIC_MODEL más viejo (400). Mitigación no negociable: esta capa defensiva
// garantiza los 10 campos con defaults seguros, coacciona tipos y mapea enums inválidos.
function toSafeNumber(value, { integer = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return integer ? Math.round(n) : n;
}

function normalizeAnalysis(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  return {
    es_comida: a.es_comida === true,
    titulo: typeof a.titulo === 'string' ? a.titulo : '',
    descripcion: typeof a.descripcion === 'string' ? a.descripcion : '',
    tipo_comida: MEAL_TYPES.includes(a.tipo_comida) ? a.tipo_comida : 'comida',
    calorias: toSafeNumber(a.calorias, { integer: true }),
    proteinas_g: toSafeNumber(a.proteinas_g),
    carbohidratos_g: toSafeNumber(a.carbohidratos_g),
    grasas_g: toSafeNumber(a.grasas_g),
    confianza: CONFIDENCE.includes(a.confianza) ? a.confianza : 'baja',
    ingredientes: Array.isArray(a.ingredientes)
      ? a.ingredientes.filter((x) => typeof x === 'string')
      : [],
  };
}

// Opus 4.7+/Sonnet 5/Fable 5 rechazan parámetros de sampling (temperature) con 400.
// El default (claude-haiku-4-5) sí la acepta; protegemos overrides a modelos que no.
function modelSupportsTemperature(model) {
  return !/opus-4-[78]|sonnet-5|fable-5|mythos/.test((model || '').toLowerCase());
}

const SYSTEM_PROMPT = `Eres un nutriólogo experto en estimación calórica visual.
Analiza la fotografía de un platillo y estima su contenido nutricional con base en:
- los alimentos identificables y su método de preparación (frito, asado, empanizado, etc.)
- el tamaño aparente de la porción usando referencias visuales (plato, cubiertos, manos, vasos)
- valores nutricionales típicos de la cocina mexicana e internacional

Reglas:
- Responde siempre en español.
- El título debe ser corto (máx. 6 palabras) y describir el platillo, no la foto.
- Si hay varios alimentos, estima el total de todo lo visible.
- Si la porción es ambigua, asume una porción estándar y baja la confianza.
- Sé realista: no subestimes aceites, aderezos ni azúcares visibles.
- Si la imagen NO contiene comida ni bebida, marca es_comida=false y deja los demás campos en valores vacíos o cero.`;

export async function analyzeFoodImage(base64, mimeType, hint = '', correction = null) {
  const provider = resolveProvider();
  const apiKey = process.env[provider.keyEnv];
  if (!apiKey) {
    const err = new Error(`Falta configurar ${provider.keyEnv} en .env.local`);
    err.code = 'NO_API_KEY';
    err.provider = provider;
    err.billed = false; // se lanza antes del try/catch → sin cobro (H1)
    throw err;
  }

  const client = new Anthropic({ apiKey, baseURL: provider.baseURL });
  const model = process.env[provider.modelEnv] || provider.defaultModel;

  const userContent = [
    {
      type: 'text',
      text:
        'Analiza este platillo y estima su información nutricional.' +
        (hint ? ` Nota del usuario: ${hint}` : ''),
    },
    { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
  ];

  const messages = [{ role: 'user', content: userContent }];
  // Reanálisis con feedback: se incluye la respuesta anterior y la corrección del usuario.
  if (correction?.feedback && correction?.previous) {
    messages.push({ role: 'assistant', content: JSON.stringify(correction.previous) });
    messages.push({
      role: 'user',
      content:
        `Corrección del usuario sobre tu análisis anterior: "${correction.feedback}".\n` +
        'Vuelve a analizar la imagen tomando en cuenta esta corrección y devuelve el análisis completo actualizado. ' +
        'Respeta lo que el usuario afirma sobre el platillo aunque contradiga tu estimación anterior.',
    });
  }

  const params = {
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages,
  };
  // Quick-win aprobado: baja la temperatura para estabilizar la estimación (misma foto ->
  // números consistentes). Solo se envía en modelos que aceptan sampling (evita 400).
  if (modelSupportsTemperature(model)) params.temperature = 0.2;

  try {
    const completion = await client.messages.create(params);

    const toolUse = completion.content.find((b) => b.type === 'tool_use');
    if (!toolUse) {
      // La API respondió 200 (SÍ facturó) pero sin bloque estructurado.
      const err = new Error('El modelo no devolvió un análisis estructurado.');
      err.provider = provider;
      err.billed = true; // hubo cobro real → NO reembolsar (H1)
      throw err;
    }
    return {
      analysis: normalizeAnalysis(toolUse.input),
      provider,
      model,
      // billed=true: Anthropic respondió 200 y facturó los tokens. Incluye el caso
      // es_comida=false (también se cobra). La ruta NO reembolsa cuando billed=true.
      billed: true,
    };
  } catch (err) {
    err.provider = provider;
    // Sin crédito/saldo de Anthropic (400 billing_error) → se mapea a insufficient_quota
    // para reutilizar el mensaje amigable de app/api/analyze/route.js.
    if (
      !err.code &&
      (err.type === 'billing_error' ||
        (err.status === 400 && /credit|billing|balance|saldo|cuota|quota/i.test(err.message || '')))
    ) {
      err.code = 'insufficient_quota';
    }
    // Señal de facturación (H1): todos los fallos que llegan aquí SIN billed marcado son
    // pre-facturación (NO_API_KEY, 401, red/timeout, 5xx, 429, 400 billing) → reembolsables.
    // Solo el 200-malformado de arriba trae billed=true.
    if (err.billed === undefined) err.billed = false;
    throw err;
  }
}
