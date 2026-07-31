// Decide cómo pintar el contenido de un mensaje del hilo del coach.
// - Los mensajes del asistente (nuevos) se guardan como JSON de la tool `responder`
//   (plan/coach-salida-formato.md §4): { titular, bloques[], accion }.
// - Los mensajes del usuario y los legacy (texto plano/Markdown) van por la ruta segura
//   de Markdown sanitizado — NUNCA se pinta `##`/`**`/`|` crudo.
// Función PURA (sin React) para poder probarla sin depender de la API.

function coerceAccion(a) {
  const o = a && typeof a === 'object' ? a : {};
  return {
    label: typeof o.label === 'string' ? o.label : '',
    accion: typeof o.accion === 'string' ? o.accion : 'ninguna',
    ref: typeof o.ref === 'string' ? o.ref : '',
  };
}

function normalizeStructured(obj) {
  return {
    titular: typeof obj.titular === 'string' ? obj.titular : '',
    bloques: Array.isArray(obj.bloques)
      ? obj.bloques.filter((b) => b && typeof b === 'object' && typeof b.tipo === 'string').slice(0, 3)
      : [],
    accion: coerceAccion(obj.accion),
  };
}

export function parseMessage(content) {
  // Ya viene como objeto estructurado (p.ej. respuesta en vivo del endpoint).
  if (content && typeof content === 'object') {
    if (typeof content.titular === 'string') return { kind: 'structured', data: normalizeStructured(content) };
    return { kind: 'markdown', text: '' };
  }

  const text = typeof content === 'string' ? content : '';
  const trimmed = text.trim();

  // Intento de parseo estructurado solo si parece un objeto JSON (barato y seguro).
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object' && typeof obj.titular === 'string') {
        return { kind: 'structured', data: normalizeStructured(obj) };
      }
    } catch {
      // No era JSON válido → se trata como texto/Markdown.
    }
  }

  return { kind: 'markdown', text };
}
