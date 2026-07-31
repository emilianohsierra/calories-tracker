// Filtro de alérgenos/restricciones DURAS en CÓDIGO (no solo prompt) — Karpathy.
// Es el FILTRO DE SALUD: debe ser HERMÉTICO. Ante la duda, SOBRE-marca (excluir una
// opción de comida es inocuo; dejar pasar un alérgeno no lo es). Cubre plurales,
// sinónimos y CATEGORÍAS (frutos secos, mariscos, pescados, lácteos, gluten…).
// Se aplica en los ejecutores de las tools de comida (registro y sugerencia).

// Normaliza: minúsculas, sin acentos, espacios colapsados, trim. (No quita plurales aquí.)
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Singular best-effort en español para una palabra suelta:
// nueces→nuez, luces→luz · mariscos→marisco, almendras→almendra · flanes→flan.
function singular(w) {
  if (w.length > 4 && w.endsWith('ces')) return `${w.slice(0, -3)}z`;
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

// Formas normalizadas de un término (frase completa + cada palabra + sus singulares).
// Se descartan tokens < 3 para evitar coincidencias triviales.
function forms(term) {
  const n = norm(term);
  if (!n) return [];
  const set = new Set([n, singular(n)]);
  for (const w of n.split(' ')) {
    if (!w) continue;
    set.add(w);
    set.add(singular(w));
  }
  return [...set].filter((x) => x.length >= 3);
}

// Miembros por grupo/categoría de alérgeno (normalizados al usarse). Extensible.
const GROUPS = {
  lacteo: ['leche', 'queso', 'yogur', 'yoghurt', 'crema', 'mantequilla', 'lactosa', 'suero', 'nata', 'requeson', 'cuajada', 'caseina', 'ghee'],
  gluten: ['gluten', 'trigo', 'harina', 'pan', 'pasta', 'cebada', 'centeno', 'avena', 'malta', 'cuscus', 'seitan', 'galleta', 'espelta'],
  mani: ['cacahuate', 'cacahuete', 'mani'],
  frutos_secos: ['nuez', 'almendra', 'avellana', 'pistache', 'pistacho', 'maranon', 'anacardo', 'castana', 'macadamia', 'pinon', 'nogal', 'nuez de la india'],
  marisco: ['camaron', 'langosta', 'cangrejo', 'pulpo', 'calamar', 'almeja', 'mejillon', 'ostion', 'ostra', 'jaiba', 'langostino', 'callo', 'abulon', 'marisco', 'crustaceo', 'molusco'],
  pescado: ['pescado', 'pez', 'atun', 'salmon', 'tilapia', 'sardina', 'bacalao', 'mojarra', 'trucha', 'robalo', 'mero', 'huachinango', 'anchoa'],
  huevo: ['huevo', 'clara', 'yema', 'ovoalbumina'],
  soya: ['soya', 'soja', 'tofu', 'edamame', 'tempeh', 'miso'],
  ajonjoli: ['ajonjoli', 'sesamo', 'tahini'],
};

// Términos que ACTIVAN un grupo (nombres de categoría + miembros clave). Si la restricción
// coincide con cualquiera, se prohíben TODOS los miembros del grupo.
const GROUP_TRIGGERS = {
  lacteo: ['lacteo', 'lacteos', 'lactosa', 'leche', 'derivado lacteo'],
  gluten: ['gluten', 'trigo', 'celiaco', 'celiaquia', 'tacc'],
  mani: ['mani', 'cacahuate', 'cacahuete'],
  frutos_secos: ['fruto seco', 'frutos secos', 'nuez', 'oleaginosa', 'nueces'],
  marisco: ['marisco', 'mariscos', 'crustaceo', 'crustaceos', 'molusco', 'moluscos'],
  pescado: ['pescado', 'pescados', 'pez'],
  huevo: ['huevo', 'huevos'],
  soya: ['soya', 'soja'],
  ajonjoli: ['ajonjoli', 'sesamo', 'ajonjol'],
};

// Construye el set de términos prohibidos (normalizados + singulares) a partir de las
// restricciones: el término literal + todos los miembros de los grupos que active.
function bannedSet(restrictions) {
  const banned = new Set();
  for (const r of restrictions || []) {
    const rForms = forms(r);
    if (!rForms.length) continue;
    for (const f of rForms) banned.add(f);
    for (const [g, triggers] of Object.entries(GROUP_TRIGGERS)) {
      const trig = new Set(triggers.flatMap(forms));
      if (rForms.some((f) => trig.has(f))) {
        for (const m of GROUPS[g]) for (const f of forms(m)) banned.add(f);
      }
    }
  }
  return banned;
}

// Devuelve los ingredientes que VIOLAN alguna restricción (vacío = seguro).
// Coincidencia bidireccional por formas (incluye/igual) → robusta a plurales y variantes.
export function findViolations(ingredients = [], restrictions = []) {
  const banned = bannedSet(restrictions);
  if (!banned.size) return [];
  const hits = [];
  for (const ing of ingredients) {
    const ingForms = forms(ing);
    let hit = false;
    for (const f of ingForms) {
      for (const b of banned) {
        if (f === b || f.includes(b) || b.includes(f)) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    if (hit) hits.push(ing);
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
