// Capa ÚNICA de normalización nutricional multi-fuente. Convierte los alias de cada fuente
// (OFF: energy-kcal_100g/proteins_100g…; interno: kcal/prot…; USDA a futuro) a un ESQUEMA
// CANÓNICO por-100g, y computa por-porción. NADA de invención: campo ausente = null.
//
// Interfaz para sumar fuentes SIN tocar el ProductSearchService (OFF ya resuelto; USDA luego):
//   SourceAdapter = {
//     key: 'open_food_facts' | 'usda' | ...,      // identidad de la fuente
//     nivel: 'verificado' | 'estimado_ia' | ...,  // confianza que aporta
//     fetchByBarcode(code): Promise<RawProduct|null>,
//     searchByName(q, {limit}): Promise<RawProduct[]>,   // cada Raw trae `code`
//     toCanonical(raw): { nutricion: CanonicalNutrition, ...meta }  // usa toCanonical() de aquí
//   }
// El servicio itera una lista ordenada de adapters (Ada define el orden). Añadir USDA = un archivo
// nuevo que implemente esta interfaz + su mapeo de alias en toCanonical.

// Claves canónicas por-100g. nutri_score/nova_group son metadatos (no escalan por porción).
export const CANONICAL_KEYS = [
  'calories_per_100g', 'protein_g', 'carbs_g', 'fat_g', 'saturated_fat_g',
  'trans_fat_g', 'fiber_g', 'sugars_g', 'sodium_mg',
];

// Negativo = dato absurdo de la fuente (kcal/gramos/mg < 0) → null (no fabricamos ni 0). Slowking H3.
function num(v) {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : null;
}
// Primer alias no-nulo (coerción numérica). Ausente en todos → null (no inventa).
function pick(raw, keys) {
  for (const k of keys) {
    if (raw[k] != null) {
      const v = num(raw[k]);
      if (v != null) return v;
    }
  }
  return null;
}

// Mapea un objeto de nutrimentos de CUALQUIER fuente → canónico por-100g. Acepta alias de OFF
// (`energy-kcal_100g`), internos (`kcal`,`prot`,`sodio_mg`) y genéricos (`calories`,`protein_g`).
export function toCanonical(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  // calorías: kcal directo; si sólo hay energía en kJ, convertir.
  let kcal = pick(r, ['energy-kcal_100g', 'calories_per_100g', 'calories', 'kcal', 'energy_kcal']);
  if (kcal == null) {
    const kj = pick(r, ['energy_100g', 'energy_kj', 'energy']);
    if (kj != null) kcal = Math.round(kj / 4.184);
  }
  // sodio: mg directo; si viene en g (OFF sodium_100g), a mg.
  let sodio = pick(r, ['sodium_mg', 'sodio_mg']);
  if (sodio == null) {
    const sodG = pick(r, ['sodium_100g', 'sodium_g']);
    if (sodG != null) sodio = Math.round(sodG * 1000);
  }
  return {
    calories_per_100g: kcal,
    protein_g: pick(r, ['proteins_100g', 'protein_g', 'prot']),
    carbs_g: pick(r, ['carbohydrates_100g', 'carbs_g', 'carb']),
    fat_g: pick(r, ['fat_100g', 'fat_g', 'gras']),
    saturated_fat_g: pick(r, ['saturated-fat_100g', 'saturated_fat_g', 'grasa_sat']),
    trans_fat_g: pick(r, ['trans-fat_100g', 'trans_fat_g', 'grasa_trans']),
    fiber_g: pick(r, ['fiber_100g', 'fiber_g', 'fibra']),
    sugars_g: pick(r, ['sugars_100g', 'sugars_g', 'azucar', 'azucares_g']),
    sodium_mg: sodio,
  };
}

// Escala el canónico por-100g a una PORCIÓN en gramos/ml. serving_size en la misma base (g/ml).
// Devuelve null si no hay porción válida (no se inventa). Redondea a 1 decimal.
export function perServing(canon100, serving_size) {
  const s = Number(serving_size);
  if (!canon100 || typeof canon100 !== 'object' || !Number.isFinite(s) || s <= 0) return null;
  const factor = s / 100;
  const out = {};
  for (const k of CANONICAL_KEYS) {
    const v = canon100[k];
    out[k] = v == null ? null : Math.round(v * factor * 10) / 10;
  }
  return out;
}

// Normaliza el grade Nutri-Score a 'a'..'e' o null (nada de 'unknown'/'not-applicable').
export function nutriScore(v) {
  const g = String(v || '').trim().toLowerCase();
  return ['a', 'b', 'c', 'd', 'e'].includes(g) ? g : null;
}
// Normaliza NOVA a 1..4 o null.
export function novaGroup(v) {
  const nvo = Number(v);
  return Number.isInteger(nvo) && nvo >= 1 && nvo <= 4 ? nvo : null;
}
