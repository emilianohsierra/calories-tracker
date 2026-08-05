// Despensa · lectura de ETIQUETA nutricional por foto. Reusa el patrón de app/api/analyze
// (visión + tool-use), consistente con lib/coach/actions.js (estimarComida usa
// anthropic.messages + tool_choice). Los valores extraídos son ESTIMADO_IA (el OCR puede
// errar) hasta que la persona los CONFIRME. La normalización es PURA y testeable; la
// llamada de visión es IO. El modelo LEE la etiqueta, no inventa.

// Tool de visión (formato Anthropic, strict-friendly: todos los campos required).
export const LEER_ETIQUETA_TOOL = {
  name: 'leer_etiqueta',
  description:
    'Extrae los valores de una tabla nutricional fotografiada. Devuelve los números TAL CUAL aparecen en la etiqueta; NUNCA inventes. Si un campo no aparece, ponlo en 0.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['es_etiqueta', 'base', 'porcion_g', 'kcal', 'prot', 'carb', 'gras', 'fibra', 'azucar', 'sodio_mg'],
    properties: {
      es_etiqueta: { type: 'boolean', description: 'true solo si la imagen muestra una tabla nutricional.' },
      base: { type: 'string', enum: ['por_100g', 'por_porcion'], description: 'A qué se refieren los valores.' },
      porcion_g: { type: 'number', description: 'Gramos por porción (0 si no aparece).' },
      kcal: { type: 'number' },
      prot: { type: 'number' },
      carb: { type: 'number' },
      gras: { type: 'number' },
      fibra: { type: 'number' },
      azucar: { type: 'number' },
      sodio_mg: { type: 'number' },
    },
  },
};

const num0 = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);

// PURA: normaliza la salida de la tool a un objeto de producto con procedencia estimado_ia.
// Devuelve null si la imagen no es una etiqueta. Redondea y descarta negativos.
export function normalizeEtiqueta(raw) {
  if (!raw || typeof raw !== 'object' || raw.es_etiqueta === false) return null;
  const base = raw.base === 'por_porcion' ? 'por_porcion' : 'por_100g';
  return {
    base,
    porcion_g: Math.round(num0(raw.porcion_g)),
    kcal: Math.round(num0(raw.kcal)),
    prot: Math.round(num0(raw.prot)),
    carb: Math.round(num0(raw.carb)),
    gras: Math.round(num0(raw.gras)),
    fibra: Math.round(num0(raw.fibra)),
    azucar: Math.round(num0(raw.azucar)),
    sodio_mg: Math.round(num0(raw.sodio_mg)),
    procedencia: 'estimado_ia', // hasta que la persona confirme/corrija (§6)
    confirmado: false,
  };
}

// IO: llama a Claude visión con la tool. Devuelve normalizeEtiqueta(...) o null. El CTO inyecta
// el cliente `anthropic` (igual que estimarComida/generarCena en lib/coach/actions.js).
export async function leerEtiqueta({ anthropic, model, base64, mimeType }) {
  if (!anthropic || !base64 || !mimeType) return null;
  const r = await anthropic.messages.create({
    model,
    max_tokens: 400,
    system:
      'Eres un lector de etiquetas nutricionales. Extrae los valores EXACTOS de la tabla; NUNCA inventes ni redondees a ojo. Responde SIEMPRE llamando la herramienta leer_etiqueta.',
    tools: [LEER_ETIQUETA_TOOL],
    tool_choice: { type: 'tool', name: 'leer_etiqueta' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: 'Extrae los valores de esta tabla nutricional.' },
        ],
      },
    ],
  });
  const tb = (r?.content || []).find((b) => b.type === 'tool_use' && b.name === 'leer_etiqueta');
  return tb?.input ? normalizeEtiqueta(tb.input) : null;
}
