// Cliente de la capa educativa del coach. Envuelve los endpoints DETERMINISTAS ya vivos.
// Regla dura: la UI NO inventa contenido; solo renderiza lo que devuelve el backend.
// Deploy-safe: cualquier fallo/kill-switch → devuelve null; los componentes degradan sin romper.

async function jsonPost(url, body) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { _error: true, status: res.status, ...(data || {}) };
    return data;
  } catch {
    return null;
  }
}

async function jsonGet(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

// A) Evaluación de nivel
export function getNivelPreguntas() { return jsonGet('/api/coach/nivel'); }           // → { preguntas:[{id,pregunta}], autoOpciones:[] } | null
export function postNivel(body) { return jsonPost('/api/coach/nivel', body); }        // { autoSelect?|respuestas?|skip? } → { nivel, guardado } | null

// B) "¿Por qué?" adaptativo
export function explicar(body) { return jsonPost('/api/coach/explicar', body); }      // { concepto?|pregunta? } → { titulo, texto, nivel } | { derivar,titulo,texto } | {_error}

// C/D) Educación (estado + lección + quiz)
export function getEducacion() { return jsonGet('/api/coach/educacion'); }            // → { nivel, vistos, ofrecer } | null
export function postLeccion(concepto) { return jsonPost('/api/coach/educacion', { accion: 'leccion', concepto }); } // → { titulo, cuerpo, quiz, concepto } | { pro, mensaje } | {_error}
export function postQuiz(concepto, correcto) { return jsonPost('/api/coach/educacion', { accion: 'quiz', concepto, correcto: !!correcto }); } // → { ok } | {_error}
