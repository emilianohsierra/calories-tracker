// Capa de datos de la Despensa. Contrato (CTO):
//   pantry_items { id, nombre, marca, categoria, cantidad, unidad, caduca_el,
//                  nutricion: { kcal, prot, carb, gras }, confianza, imagen }
// V1 usa FALLBACK local (localStorage + seed mock) para NO bloquearse del schema del
// backend. Cada operación intenta el endpoint real y, si no existe, opera local.
// Cuando el CTO publique /api/pantry (+ CRUD), se cablea cambiando USE_API a true o
// dejando que el fetch tenga éxito.

const LS_KEY = 'pantry_items_v1';

const SEED = [
  { id: 'seed-1', nombre: 'Pechuga de pollo', marca: 'Bachoco', categoria: 'proteinas', cantidad: 450, unidad: 'g', caduca_el: null, nutricion: { kcal: 165, prot: 31, carb: 0, gras: 3.6 }, confianza: 'verified', imagen: '' },
  { id: 'seed-2', nombre: 'Avena en hojuelas', marca: 'Quaker', categoria: 'carbos', cantidad: 1200, unidad: 'g', caduca_el: null, nutricion: { kcal: 389, prot: 13, carb: 66, gras: 7 }, confianza: 'verified', imagen: '' },
  { id: 'seed-3', nombre: 'Yogur griego natural', marca: 'Oikos', categoria: 'lacteos', cantidad: 4, unidad: 'pza', caduca_el: shortDate(2), nutricion: { kcal: 59, prot: 10, carb: 3.6, gras: 0.4 }, confianza: 'ai', imagen: '' },
  { id: 'seed-4', nombre: 'Manzana', marca: '', categoria: 'frutas', cantidad: 6, unidad: 'pza', caduca_el: shortDate(9), nutricion: { kcal: 52, prot: 0.3, carb: 14, gras: 0.2 }, confianza: 'user', imagen: '' },
];

// Fecha ISO (YYYY-MM-DD) a N días desde hoy (solo para el seed de demo).
function shortDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function readLocal() {
  if (typeof window === 'undefined') return SEED;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) {
      window.localStorage.setItem(LS_KEY, JSON.stringify(SEED));
      return SEED;
    }
    return JSON.parse(raw);
  } catch {
    return SEED;
  }
}

function writeLocal(items) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    // sin persistencia si localStorage falla; la sesión sigue en memoria
  }
}

function uid() {
  return `p-${Math.random().toString(36).slice(2, 9)}`;
}

// GET inventario. Intenta el endpoint; si no existe, fallback local.
export async function getPantry() {
  try {
    const res = await fetch('/api/pantry');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.items)) return data.items;
    }
  } catch {
    // sin backend → local
  }
  return readLocal();
}

export async function addProduct(item) {
  const withId = { ...item, id: item.id || uid() };
  try {
    const res = await fetch('/api/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withId),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.item || withId;
    }
  } catch {
    // fallback local
  }
  const items = readLocal();
  const next = [withId, ...items];
  writeLocal(next);
  return withId;
}

export async function updateItem(id, patch) {
  try {
    const res = await fetch(`/api/pantry/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.item || { id, ...patch };
    }
  } catch {
    // fallback local
  }
  const items = readLocal().map((it) => (it.id === id ? { ...it, ...patch } : it));
  writeLocal(items);
  return items.find((it) => it.id === id);
}

export async function deleteItem(id) {
  try {
    const res = await fetch(`/api/pantry/${id}`, { method: 'DELETE' });
    if (res.ok) return true;
  } catch {
    // fallback local
  }
  writeLocal(readLocal().filter((it) => it.id !== id));
  return true;
}
