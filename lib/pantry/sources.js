// Adapters de fuentes EXTERNAS de IDENTIFICACIÓN por barcode (UPCitemdb, Barcode Lookup).
// SOLO identifican nombre/marca/imagen — NO traen nutrición confiable → NO se persiste su
// nutrición (regla de Emiliano: se persiste SOLO OFF). El service las usa como último recurso
// antes del fallback, y encola la contribución. Server-only: las API keys viven en env server.
//
// Regla dura (Karpathy §4): NADA se inventa. Si la fuente no trae un campo → null.

import { httpUrl } from './text.js';

const TIMEOUT_MS = 2500;

// GET con timeout AbortController; nunca lanza (devuelve null en fallo/timeout).
async function getJson(url, { fetchImpl = fetch, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { 'User-Agent': 'CaloriesTracker/1.0 (despensa)', ...headers } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function clip(s, n) {
  return s ? String(s).trim().slice(0, n) : '';
}

// UPCitemdb (trial endpoint). Devuelve identificación mínima o null.
export async function fetchUPCitemdb(code, opts = {}) {
  const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`;
  const j = await getJson(url, opts);
  const item = j?.items?.[0];
  if (!item) return null;
  const nombre = clip(item.title, 120);
  if (!nombre) return null;
  return {
    nombre,
    marca: clip(item.brand, 80),
    image_url: httpUrl(Array.isArray(item.images) ? item.images[0] : ''), // solo http/https
    source: 'upcitemdb',
  };
}

// Barcode Lookup (requiere API key en env server). Sin key → se omite (null).
export async function fetchBarcodeLookup(code, opts = {}) {
  const key = (process.env.BARCODE_LOOKUP_API_KEY || '').trim();
  if (!key) return null;
  const url = `https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(code)}&formatted=y&key=${encodeURIComponent(key)}`;
  const j = await getJson(url, opts);
  const p = j?.products?.[0];
  if (!p) return null;
  const nombre = clip(p.title || p.product_name, 120);
  if (!nombre) return null;
  return {
    nombre,
    marca: clip(p.brand, 80),
    image_url: httpUrl(Array.isArray(p.images) ? p.images[0] : ''), // solo http/https
    source: 'barcode_lookup',
  };
}

// Orquesta las fuentes de identificación en orden; primera que responde gana. Devuelve
// { nombre, marca, image_url, source } | null. NUNCA incluye nutrición.
export async function identificarExterno(code, opts = {}) {
  const adapters = opts.adapters || [fetchUPCitemdb, fetchBarcodeLookup];
  for (const adapter of adapters) {
    const r = await adapter(code, opts);
    if (r) return r;
  }
  return null;
}
