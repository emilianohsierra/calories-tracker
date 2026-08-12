// Coach · Educación — ESTIMACIÓN DE NIVEL (Karpathy §1). Todo PURO y testeable.
// Prior conductual (0 IA) + rúbrica determinista sobre las preguntas de verificación. La IA (si se
// usa) SOLO clasifica qué conceptos aparecen; el mapeo concepto→banda y la agregación son
// deterministas. Nivel INVISIBLE al usuario, recalibrable. Agregación conservadora (redondeo hacia
// abajo, empates → banda menor: mejor sub-estimar que abrumar).
import { NIVELES, NIVEL_DEFAULT } from './curriculum';

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Prior determinista desde datos reales del usuario. Conservador: default 'basico'; sin onboarding
// → 'principiante'; objetivos que implican más contexto (hipertrofia/runner/recomposición) → sesga
// un punto arriba. Las preguntas afinan esto.
export function priorNivel(perfil) {
  if (!perfil) return 'principiante';
  if (perfil.onboarding_completed === false) return 'principiante';
  const avanzados = ['hipertrofia', 'runner', 'recomposicion'];
  if (avanzados.includes(perfil.coach)) return 'intermedio';
  return NIVEL_DEFAULT; // 'basico'
}

// Banda 0–3 de UNA respuesta abierta según las señales por banda de la pregunta (rúbrica Karpathy).
// Revisa de la banda ALTA a la baja: la primera que matchea gana (una respuesta correcta con un
// desliz cuenta como correcta, no como "mal"). Sin señal / "no sé" → 0 (bajo, SIN marcar mal).
export function bandaRespuesta(texto, senales) {
  const t = norm(texto);
  if (!t) return 0;
  for (let b = 3; b >= 1; b -= 1) {
    const sigs = (senales && senales[b]) || [];
    if (sigs.some((s) => t.includes(norm(s)))) return b;
  }
  return 0; // banda 0: idea equivocada o sin señal (no se penaliza, solo modula profundidad)
}

// Agrega las bandas de las respuestas → nivel. Media redondeada hacia ABAJO (conservador).
export function agregarBandas(bandas) {
  const arr = (bandas || []).filter((b) => Number.isFinite(b));
  if (!arr.length) return null;
  const media = arr.reduce((a, b) => a + b, 0) / arr.length;
  const idx = Math.floor(media); // empates/decimales → hacia abajo
  return NIVELES[Math.max(0, Math.min(NIVELES.length - 1, idx))];
}

// Estimación final del nivel para guardar. Prioridad: respuestas (rúbrica) > auto-selección > prior.
//   { prior, autoSelect, bandas } → nivel ∈ NIVELES.
// autoSelect 'compruebame' o inválido → se ignora (se usa la rúbrica/prior).
export function estimarNivel({ prior, autoSelect, bandas } = {}) {
  const porRubrica = agregarBandas(bandas);
  if (porRubrica) return porRubrica;
  if (NIVELES.includes(autoSelect)) return autoSelect;
  return NIVELES.includes(prior) ? prior : NIVEL_DEFAULT;
}
