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
export function getEducacion() { return jsonGet('/api/coach/educacion'); }            // → { nivel, vistos, ofrecer, repaso?, temas? } | null
export function postLeccion(concepto) { return jsonPost('/api/coach/educacion', { accion: 'leccion', concepto }); } // → { titulo, cuerpo, quiz, concepto } | { pro, mensaje } | {_error}
export function postQuiz(concepto, correcto) { return jsonPost('/api/coach/educacion', { accion: 'quiz', concepto, correcto: !!correcto }); } // → { ok } | {_error}

// Repaso espaciado (contrato EXTENDIDO del CTO):
export function postRepaso(concepto, correcto, confianza) {                            // → { ok } | {_error}
  return jsonPost('/api/coach/educacion', { accion: 'repaso', concepto, correcto: !!correcto, ...(confianza != null ? { confianza } : {}) });
}
export function postOferta(acepto) { return jsonPost('/api/coach/educacion', { accion: 'oferta', acepto: !!acepto }); } // → { ok } | {_error}

// GET para la UI del repaso. Contrato REAL del CTO: GET → { nivel, vistos, ofrecer, repaso }, con
// repaso = { concepto, titulo, pendientes, atrasado_dias, item:{contexto,pregunta,opciones,correcta,
// feedback_ok,feedback_no} } | null. ⚠️ El GET NO trae `temas` (mapa por-tema) todavía → el mapa
// degrada al contador; ver aviso a Lugia/CTO (necesito `temas[]` en el GET para el mapa de 3 estados).
// En dev (no producción) se rellenan mock SÓLO si faltan, para ver mapa/tarjeta sin backend.
const MOCK_TEMAS = [
  { concepto: 'proteina', titulo: 'Proteína', estado: 'dominado', due: false },
  { concepto: 'deficit', titulo: 'Déficit', estado: 'aprendiendo', due: true },
  { concepto: 'calidad_sin_culpa', titulo: 'Calidad sin culpa', estado: 'nuevo', due: false },
];
const MOCK_REPASO = {
  concepto: 'deficit', titulo: 'Déficit', atrasado_dias: 2,
  item: { contexto: 'Tu meta de hoy está calculada sin extremos.', pregunta: 'Un déficit sano es…', opciones: ['No comer', 'Comer un poco menos de lo que gastas', 'Solo ensaladas'], correcta: 1, feedback_ok: 'Exacto: comer un poco menos de lo que gastas, sostenible.', feedback_no: 'Es comer un poco menos de lo que gastas, sostenible — no privarte.' },
};

export async function getEducacionUI() {
  const d = await getEducacion();
  if (!d) return null;
  if (process.env.NODE_ENV === 'production') return d; // prod: tal cual (mapa degrada si no hay temas)
  return {
    ...d,
    temas: d.temas || MOCK_TEMAS,
    repaso: d.repaso !== undefined ? d.repaso : MOCK_REPASO,
  };
}
