// Capa de datos de la Despensa — SERVER-backed. `/api/pantry` (+ CRUD) es la ÚNICA fuente de verdad.
// SIN seed ficticio ni fallback a localStorage: era data del servidor; el fallback fabricaba
// productos DEMO (viola la regla de oro / instrucción de Emiliano) y PERDÍA escrituras en silencio
// cuando la API fallaba o la sesión expiraba. Ahora todo error se PROPAGA para que el UI muestre su
// estado real (reintentar); sesión expirada (401) → PantryError code 'unauthorized' → el UI manda a login.

export class PantryError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PantryError';
    this.code = code;
  }
}

async function pantryFetch(url, opts) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new PantryError('Sin conexión con el servidor.', 'network');
  }
  if (res.status === 401) throw new PantryError('Tu sesión expiró. Inicia sesión de nuevo.', 'unauthorized');
  if (!res.ok) throw new PantryError('El servidor no pudo completar la operación.', 'server');
  return res;
}

// GET inventario REAL del servidor. Lanza si falla (el UI muestra error/reintentar).
export async function getPantry() {
  const res = await pantryFetch('/api/pantry');
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.items) ? data.items : [];
}

// Producto propio NUEVO (sin product_id, capturado por el usuario) → alimenta el CATÁLOGO vía
// POST /api/pantry/products (best-effort: si falla, se agrega el ítem sin product_id). Los de
// catálogo (match) ya traen product_id.
async function createCatalogProduct(item) {
  try {
    const res = await fetch('/api/pantry/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: item.nombre,
        marca: item.marca,
        categoria: item.categoria,
        unidad: item.unidad,
        codigo: item.codigo || null,
        nutricion: item.nutricion,
        imagen: item.imagen || null,
        is_user_created: true,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      return d?.product_id || d?.product?.id || d?.id || null;
    }
  } catch {
    // contribución al catálogo es opcional → seguimos sin product_id
  }
  return null;
}

export async function addProduct(item) {
  let it = { ...item };
  if (!it.product_id && it.confianza === 'user') {
    const pid = await createCatalogProduct(it);
    if (pid) it = { ...it, product_id: pid };
  }
  const res = await pantryFetch('/api/pantry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(it),
  });
  const data = await res.json().catch(() => ({}));
  return data?.item || it; // el server devuelve el ítem con su id real
}

export async function updateItem(id, patch) {
  const res = await pantryFetch(`/api/pantry/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  return data?.item || { id, ...patch };
}

export async function deleteItem(id) {
  await pantryFetch(`/api/pantry/${id}`, { method: 'DELETE' });
  return true;
}
