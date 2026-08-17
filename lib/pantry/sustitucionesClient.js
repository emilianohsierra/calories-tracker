// Cliente de SUSTITUCIONES para la ficha del producto. Consume el endpoint que expondrá el CTO
// (envuelve el mismo `sustituir()` puro del coach → filtra alérgenos vía safety.js; la UI NO inventa).
// Forma acordada (idéntica a lib/coach/actions.js sugerirSustitucion):
//   GET /api/pantry/sustituciones?product_id=<id>
//     → { ok, sustituciones: [{ product_id, nombre, nutri_score, sellos:[...], disponible, razon }],
//         objetivo?: { product_id, nombre, nutri_score, sellos }, nota? }
// `objetivo` (aditivo del CTO) = el producto objetivo; la UI lo ignora por ahora (no lo necesita).
// Deploy-safe: si el endpoint falla/no existe → null (la ficha NO muestra la sección, no se rompe).
// { sustituciones: [] } (con `nota`) = estado VACÍO honesto (no hay mejor opción segura).
// En dev (no producción) devuelve un mock SÓLO si no hay backend, para ver la UI.

export async function getSustituciones(productId) {
  if (!productId) return null;
  try {
    const res = await fetch(`/api/pantry/sustituciones?product_id=${encodeURIComponent(productId)}`);
    if (res.ok) {
      const d = await res.json().catch(() => null);
      if (d && (Array.isArray(d.sustituciones) || d.ok)) {
        return { sustituciones: Array.isArray(d.sustituciones) ? d.sustituciones : [], nota: d.nota || '', objetivo: d.objetivo || null };
      }
    }
  } catch {
    // sin backend / red caída
  }
  if (process.env.NODE_ENV === 'production') return null; // prod: degrada (sección ausente)
  return mock(productId);
}

// Mock determinista SÓLO para dev (sin backend). No se usa en producción.
function mock(productId) {
  if (String(productId).includes('empty')) {
    return { sustituciones: [], nota: 'No encontramos una mejor opción segura para este producto por ahora.', objetivo: 'Producto' };
  }
  return {
    objetivo: 'Producto',
    nota: '',
    sustituciones: [
      { product_id: 's1', nombre: 'Yogur griego natural', nutri_score: 'a', sellos: [], disponible: true, razon: 'Sin sellos de exceso y mejor Nutri-Score.' },
      { product_id: 's2', nombre: 'Avena tradicional', nutri_score: 'b', sellos: [], disponible: false, razon: 'Menos sellos que tu producto.' },
    ],
  };
}
