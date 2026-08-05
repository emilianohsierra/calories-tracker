// Normalización de texto para el catálogo de despensa (búsqueda por nombre/marca y `norm`
// de-duplicado). Minúsculas, sin acentos, sin puntuación, espacios colapsados.
// (Helper de utilería; la LÓGICA DE MATCHING vive en el módulo de Karpathy, no aquí.)
export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Coacción segura de una cantidad numérica (>= 0). Devuelve null si inválida.
export function cantidadValida(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
}
