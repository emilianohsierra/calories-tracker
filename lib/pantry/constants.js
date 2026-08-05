// Constantes de la Despensa. Categorías, niveles de confianza y unidades.

// Categorías (id estable + label + icono del set canónico).
export const CATEGORIES = [
  { id: 'all', label: 'Todos', icon: 'box' },
  { id: 'proteinas', label: 'Proteínas', icon: 'flame' },
  { id: 'carbos', label: 'Carbos', icon: 'utensils' },
  { id: 'frutas', label: 'Frutas', icon: 'droplet' },
  { id: 'verduras', label: 'Verduras', icon: 'activity' },
  { id: 'lacteos', label: 'Lácteos', icon: 'droplet' },
  { id: 'snacks', label: 'Snacks', icon: 'star' },
  { id: 'bebidas', label: 'Bebidas', icon: 'droplet' },
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
