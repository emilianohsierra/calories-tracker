// País de origen inferido del PREFIJO GS1 del código de barras (determinista, sin fuente externa).
// El prefijo (primeros 3 dígitos del EAN-13) identifica la organización GS1 que asignó el código,
// que suele mapear al país de registro de la marca. Devuelve ISO-2 o null. NADA de invención:
// prefijo desconocido → null (no se asume país).
//
// Rangos GS1 relevantes para el enfoque LatAm/MX (subconjunto, ampliable):
//   000–139  → US (Estados Unidos/Canadá; UPC-A embebido)
//   750      → MX (México)
//   770–771  → CO (Colombia)
//   779      → AR (Argentina)
//   780      → CL (Chile)
//   840–849  → ES (España)
export function countryFromBarcode(code) {
  const s = String(code || '').replace(/\D/g, '');
  if (s.length < 3) return null;
  const p = parseInt(s.slice(0, 3), 10);
  if (Number.isNaN(p)) return null;
  if (p >= 0 && p <= 139) return 'US';
  if (p === 750) return 'MX';
  if (p >= 770 && p <= 771) return 'CO';
  if (p === 779) return 'AR';
  if (p === 780) return 'CL';
  if (p >= 840 && p <= 849) return 'ES';
  return null;
}

// Países soportados para priorización multi-país (default de la app = MX).
export const PAISES_SOPORTADOS = ['MX', 'US', 'ES', 'AR', 'CO', 'CL'];
export const PAIS_DEFAULT = 'MX';

// País REAL del producto desde countries_tags de OFF (p.ej. 'en:mexico' → 'MX'). Es el origen/venta
// declarado (autoritativo), a diferencia del prefijo GS1 (org de registro de la marca). Si hay varios
// tags, prioriza el primero soportado; si ninguno mapea, null (no se asume país). Nada de invención.
const TAG_TO_ISO = {
  mexico: 'MX', 'united-states': 'US', 'united-states-of-america': 'US', usa: 'US',
  spain: 'ES', espana: 'ES', argentina: 'AR', colombia: 'CO', chile: 'CL',
};
export function countryFromTags(tags) {
  const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  for (const t of list) {
    const key = String(t || '').toLowerCase().replace(/^[a-z]{2}:/, '').trim();
    if (TAG_TO_ISO[key]) return TAG_TO_ISO[key];
  }
  return null;
}
