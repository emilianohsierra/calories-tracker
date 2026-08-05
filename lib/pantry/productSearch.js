// Cliente del ProductSearchService (CTO). Shape del servicio:
//   { match: 'auto' | 'disambiguation' | 'miss', producto?, candidatos?, confianza }
// producto/candidatos: { product_id, nombre, marca, presentacion, categoria, unidad,
//   nutricion:{kcal,prot,carb,gras,fibra,azucar,sodio,porcion}, confianza:'verified|user|ai',
//   imagen|image_url, is_user_created, codigo }
// V1 usa FALLBACK: intenta el endpoint; si aún devuelve el shape viejo {products} lo adapta,
// y si no hay backend usa un mock determinista para no bloquear la UI.
import { normalizeNutricion, imageOf } from '@/lib/pantry/constants';

export async function searchProduct(q) {
  try {
    const res = await fetch(`/api/pantry/search?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.match) return data; // shape D2 nativo
      if (Array.isArray(data?.products)) return adaptLegacy(data.products); // shape viejo
    }
  } catch {
    // red/backend caído
  }
  // En PRODUCCIÓN nunca fabricamos productos (regla de oro): ante fallo → miss accionable (la UI
  // ofrece foto de etiqueta / "Agregar el tuyo" precargado). El mock queda SOLO para dev sin backend.
  return process.env.NODE_ENV === 'production' ? { match: 'miss', confianza: 0 } : mockSearch(q);
}

// Adapta el shape viejo {products:[...]} al shape D2 por nº de resultados.
function adaptLegacy(products) {
  if (products.length === 0) return { match: 'miss', confianza: 0 };
  if (products.length === 1) return { match: 'auto', producto: products[0], confianza: 0.9 };
  return { match: 'disambiguation', candidatos: products.slice(0, 8), confianza: 0.7 };
}

// ¿Falta nutrición esencial? (nunca inventamos: si falta, la UI pide completar.)
export function isNutritionIncomplete(nut) {
  const n = nut || {};
  return [n.kcal, n.prot, n.carb, n.gras].some((v) => v == null);
}

// Producto del servicio → draft para ConfirmProduct.
export function productToDraft(p) {
  return {
    product_id: p.product_id,
    nombre: p.nombre || '',
    marca: p.marca || '',
    presentacion: p.presentacion || '',
    categoria: p.categoria || 'otros',
    unidad: p.unidad || 'g',
    cantidad: '',
    nutricion: normalizeNutricion(p.nutricion),
    confianza: p.is_user_created ? 'user' : p.confianza || 'verified',
    imagen: imageOf(p),
    codigo: p.codigo || '',
  };
}

// ── Mock determinista por query (solo cuando no hay backend) ──────────────────
function mockSearch(q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return { match: 'miss', confianza: 0 };
  if (s.includes('xyz') || s.length < 3) return { match: 'miss', confianza: 0.2 };
  if (s.includes('yogur') || s.includes('leche')) {
    return {
      match: 'disambiguation',
      confianza: 0.7,
      candidatos: [
        { product_id: 'm1', nombre: 'Yogur griego natural', marca: 'Oikos', presentacion: '150 g', categoria: 'lacteos', unidad: 'g', imagen: '', confianza: 'verified', nutricion: { kcal: 59, prot: 10, carb: 3.6, gras: 0.4, fibra: 0, azucar: 3.2, sodio: 36, porcion: 150 } },
        { product_id: 'm2', nombre: 'Yogur natural sin azúcar', marca: 'Danone', presentacion: '900 g', categoria: 'lacteos', unidad: 'g', imagen: '', confianza: 'verified', nutricion: { kcal: 63, prot: 5, carb: 7, gras: 1.5, fibra: 0, azucar: 7, sodio: 50, porcion: 125 } },
        { product_id: 'm3', nombre: 'Yogur bebible fresa', marca: 'Yoplait', presentacion: '220 ml', categoria: 'lacteos', unidad: 'ml', imagen: '', confianza: 'verified', nutricion: { kcal: 80, prot: 3, carb: 14, gras: 1, fibra: 0, azucar: 13, sodio: 45, porcion: 220 } },
      ],
    };
  }
  if (s.includes('pollo') || s.includes('pechuga')) {
    return {
      match: 'auto',
      confianza: 0.94,
      producto: { product_id: 'm10', nombre: 'Pechuga de pollo', marca: 'Bachoco', presentacion: '1 kg', categoria: 'proteinas', unidad: 'g', imagen: '', confianza: 'verified', is_user_created: false, codigo: '7501055310333', nutricion: { kcal: 165, prot: 31, carb: 0, gras: 3.6, fibra: 0, azucar: 0, sodio: 74, porcion: 100 } },
    };
  }
  if (s.includes('avena')) {
    // Producto con nutrición INCOMPLETA (faltan macros) → la UI pedirá completar.
    return {
      match: 'auto',
      confianza: 0.88,
      producto: { product_id: 'm11', nombre: 'Avena tradicional', marca: 'Quaker', presentacion: '400 g', categoria: 'carbos', unidad: 'g', imagen: '', confianza: 'verified', is_user_created: false, codigo: '', nutricion: { kcal: 389, prot: null, carb: null, gras: null } },
    };
  }
  // Genérico → un candidato razonable.
  return {
    match: 'auto',
    confianza: 0.8,
    producto: { product_id: 'mX', nombre: q, marca: '', presentacion: '', categoria: 'otros', unidad: 'g', imagen: '', confianza: 'ai', is_user_created: false, nutricion: { kcal: 100, prot: 2, carb: 15, gras: 2, fibra: 1, azucar: 5, sodio: 10, porcion: 100 } },
  };
}
