// Constantes de la Despensa. Categorías, niveles de confianza y unidades.

// Categorías (id estable + label + icono del set canónico).
export const CATEGORIES = [
  { id: 'all', label: 'Todos', icon: 'box' },
  { id: 'proteinas', label: 'Proteínas', icon: 'flame' },
  { id: 'carbos', label: 'Carbos', icon: 'utensils' },
  // Ola1-S6: iconos ÚNICOS por categoría (antes frutas/lácteos/bebidas compartían 'droplet' → indistinguibles).
  // lácteos = gota (leche); bebidas = burbujas; frutas = fresco. Labels desambiguan; el set carece de glifos de fruta.
  { id: 'frutas', label: 'Frutas', icon: 'sun' },
  { id: 'verduras', label: 'Verduras', icon: 'activity' },
  { id: 'lacteos', label: 'Lácteos', icon: 'droplet' },
  { id: 'snacks', label: 'Snacks', icon: 'star' },
  { id: 'bebidas', label: 'Bebidas', icon: 'sparkles' },
  { id: 'congelados', label: 'Congelados', icon: 'box' },
  { id: 'otros', label: 'Otros', icon: 'box' },
];

// Niveles de confianza (CRÍTICO). Nunca solo color: icono + label + aria.
export const CONFIDENCE = {
  verified: { id: 'verified', label: 'Verificado', short: 'Verificado', icon: 'check', color: 'var(--ok)', source: 'de catálogo', aria: 'Confianza: verificado, dato de catálogo' },
  user: { id: 'user', label: 'Tú lo pusiste', short: 'Tuyo', icon: 'pencil', color: 'var(--brand)', source: 'lo capturaste tú', aria: 'Confianza: dato capturado por ti' },
  ai: { id: 'ai', label: 'Estimado por IA', short: 'Estimado', icon: 'sparkles', color: 'var(--warn-c)', source: 'estimado de la etiqueta', aria: 'Confianza: estimado por IA, sin verificar' },
};

export function confidenceOf(level) {
  return CONFIDENCE[level] || CONFIDENCE.user;
}

// "¿qué puedo comer?" (Karpathy): la Opción trae `procedencia` con estos valores;
// se mapean a los 3 niveles del ConfidenceBadge. Alineado EXACTO al contrato.
export const PROCEDENCIA_TO_CONFIDENCE = {
  verificado: 'verified',
  introducido: 'user',
  estimado: 'ai',
};

export const UNITS = ['g', 'kg', 'ml', 'L', 'pza', 'porción'];

// Campos de nutrición mostrados/editables (kcal + macros + fibra/azúcar/sodio).
// color = token de nutriente para el punto/acento. porción se maneja aparte.
export const NUTRICION_FIELDS = [
  { key: 'kcal', label: 'Calorías', unit: 'kcal', color: 'var(--brand)' },
  { key: 'prot', label: 'Proteína', unit: 'g', color: 'var(--protein)' },
  { key: 'carb', label: 'Carbos', unit: 'g', color: 'var(--carbs)' },
  { key: 'gras', label: 'Grasa', unit: 'g', color: 'var(--fat)' },
  { key: 'fibra', label: 'Fibra', unit: 'g', color: 'var(--fiber)' },
  { key: 'azucar', label: 'Azúcar', unit: 'g', color: 'var(--carbs)' },
  { key: 'sodio', label: 'Sodio', unit: 'mg', color: 'var(--water)' },
];

// URL de imagen del producto tolerando ambas convenciones (imagen | image_url).
// URL MOSTRABLE del producto. Prefiere image_url (URL firmada/http) sobre `imagen` — este último
// puede ser un PATH de storage (foto de etiqueta) que NO se puede pintar directo (N-I6: preview roto).
export function imageOf(x) {
  return x?.image_url || x?.imagen || '';
}

// Normaliza la nutrición a claves canónicas {kcal,prot,carb,gras,fibra,azucar,sodio,porcion}
// tolerando alias de OFF/etiqueta (protein_g, sugars_g, sodium_mg, porcion_g…).
export function normalizeNutricion(n) {
  if (!n || typeof n !== 'object') return {};
  return {
    kcal: n.kcal ?? n.calories,
    prot: n.prot ?? n.protein_g,
    carb: n.carb ?? n.carbs_g,
    gras: n.gras ?? n.fat_g,
    fibra: n.fibra ?? n.fiber_g,
    azucar: n.azucar ?? n.sugars_g ?? n.azucares_g,
    sodio: n.sodio ?? n.sodium_mg ?? n.sodio_mg,
    porcion: n.porcion ?? n.porcion_g,
  };
}

// Umbrales de caducidad (días). >warn: sin aviso · <=warn: aviso · <0: caducado.
export const EXPIRY_WARN_DAYS = 3;

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d - today) / 86400000);
}
