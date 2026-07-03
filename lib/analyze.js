import OpenAI from 'openai';

// Proveedores soportados. Ambos usan la API de chat-completions compatible con OpenAI;
// Grok (xAI) expone el mismo formato en https://api.x.ai/v1.
const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseURL: undefined,
    keyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o-mini',
    billingHint: 'platform.openai.com → Billing',
  },
  grok: {
    id: 'grok',
    label: 'Grok (xAI)',
    baseURL: 'https://api.x.ai/v1',
    keyEnv: 'XAI_API_KEY',
    modelEnv: 'XAI_MODEL',
    defaultModel: 'grok-4.3',
    billingHint: 'console.x.ai → Billing',
  },
};

// AI_PROVIDER explícito manda; si no está definido, se usa el proveedor que tenga clave.
export function resolveProvider() {
  const explicit = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (explicit) {
    const provider = PROVIDERS[explicit];
    if (!provider) {
      const err = new Error(
        `AI_PROVIDER="${explicit}" no es válido. Usa: ${Object.keys(PROVIDERS).join(' | ')}`
      );
      err.code = 'BAD_PROVIDER';
      throw err;
    }
    return provider;
  }
  if (process.env.OPENAI_API_KEY) return PROVIDERS.openai;
  if (process.env.XAI_API_KEY) return PROVIDERS.grok;
  return PROVIDERS.openai;
}

const SCHEMA = {
  name: 'analisis_platillo',
  strict: true,
  schema: {
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
    throw err;
  }

  const client = new OpenAI({ apiKey, baseURL: provider.baseURL });
  const model = process.env[provider.modelEnv] || provider.defaultModel;
  const userContent = [
    {
      type: 'text',
      text:
        'Analiza este platillo y estima su información nutricional.' +
        (hint ? ` Nota del usuario: ${hint}` : ''),
    },
    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
  ];

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
  // Reanálisis con feedback: se incluye la respuesta anterior y la corrección del usuario.
  if (correction?.feedback && correction?.previous) {
    messages.push({ role: 'assistant', content: JSON.stringify(correction.previous) });
    messages.push({
      role: 'user',
      content:
        `Corrección del usuario sobre tu análisis anterior: "${correction.feedback}".\n` +
        'Vuelve a analizar la imagen tomando en cuenta esta corrección y devuelve el JSON completo actualizado. ' +
        'Respeta lo que el usuario afirma sobre el platillo aunque contradiga tu estimación anterior.',
    });
  }

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      max_tokens: 700,
    });
    return {
      analysis: JSON.parse(completion.choices[0].message.content),
      provider,
      model,
    };
  } catch (err) {
    err.provider = provider;
    throw err;
  }
}
