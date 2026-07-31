// Filtro de alérgenos/restricciones DURAS en CÓDIGO (no solo prompt) — Karpathy.
// Se aplica en el EJECUTOR de las tools de comida (Rebanada 3): ninguna sugerencia con
// un ingrediente restringido llega al usuario. Aquí la base + su test unitario.

// Normaliza: minúsculas, sin acentos, sin plurales simples, trim.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/s\b/g, '') // plural simple
    .trim();
}

// Sinónimos comunes por alérgeno (extensible). Clave = término de la restricción.
const SYNONYMS = {
  lacteo: ['leche', 'queso', 'yogur', 'crema', 'mantequilla', 'lactosa', 'suero'],
  gluten: ['trigo', 'harina', 'pan', 'pasta', 'cebada', 'centeno', 'avena'],
  mani: ['cacahuate', 'cacahuete', 'mani'],
  nuez: ['nuez', 'almendra', 'nogal', 'pistache', 'avellana', 'marañon', 'anacardo'],
  huevo: ['huevo', 'clara', 'yema'],
  marisco: ['camaron', 'langosta', 'cangrejo', 'marisco'],
  pescado: ['pescado', 'atun', 'salmon', 'tilapia', 'sardina'],
  soya: ['soya', 'soja', 'tofu', 'edamame'],
};

// Devuelve los ingredientes que VIOLAN alguna restricción (vacío = seguro).
export function findViolations(ingredients = [], restrictions = []) {
  const restr = restrictions.map(norm).filter(Boolean);
  if (!restr.length) return [];
  // Expande cada restricción con sus sinónimos normalizados.
  const banned = new Set();
  for (const r of restr) {
    banned.add(r);
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (norm(key) === r || syns.map(norm).includes(r)) {
        banned.add(norm(key));
        syns.forEach((s) => banned.add(norm(s)));
      }
    }
  }
  const hits = [];
  for (const ing of ingredients) {
    const n = norm(ing);
    for (const b of banned) {
      if (b && n.includes(b)) {
        hits.push(ing);
        break;
      }
    }
  }
  return hits;
}

export function isSafe(ingredients, restrictions) {
  return findViolations(ingredients, restrictions).length === 0;
}

// Filtra una lista de opciones {ingredientes:[]} dejando solo las seguras.
export function filterSafeOptions(options = [], restrictions = []) {
  return options.filter((o) => isSafe(o.ingredientes || o.ingredients || [], restrictions));
}
