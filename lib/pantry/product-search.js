// ProductSearchService — orquestación CACHE-FIRST (I/O + reglas de negocio). El CEREBRO
// determinista (funciones puras) lo provee Karpathy en lib/pantry/product-brain.js y se INYECTA
// como `deps.brain` (testeable aislado; import directo al cablear en el route). Server-only.
//
// Cascada: LocalDB → OFF live (persiste SOLO OFF, verificado) → identificación externa
// (UPCitemdb/BarcodeLookup: nombre/marca/imagen, NO persiste nutrición → encola contribución)
// → fallback gracioso. Reglas: NADA de invención (dato faltante = null); keys externas server-only;
// rate-limit + timeouts + presupuesto via external_fetch_log. Update = APPEND (cacheOFF inserta).
//
// Resultado: { match:'auto'(≥0.85)|'disambiguation'(0.45–0.85)|'miss'(<0.45),
//              producto?|candidatos?, confianza?, source, atribucion?, contribuible? }

import { fetchOFF as _fetchOFF, cacheOFF as _cacheOFF, searchOFFByName as _searchOFFByName } from './off.js';
import { identificarExterno as _identificarExterno } from './sources.js';
import { norm } from './text.js';
import * as brainDefault from './product-brain.js';

const UMBRALES = { auto: 0.85, disambiguation: 0.45 };
const RATE = { maxPerHour: 30 };

const NIVEL_TO_CONFIANZA = { verificado: 'verified', usuario: 'user', estimado_ia: 'ai' };
const NUT_COLS = 'base_amount, base_unit, calories, protein_g, carbs_g, fat_g, fiber_g, azucar_g, sodium_mg, saturated_fat_g, allergens, nivel, source, source_ref, source_updated_at, as_of';
const PROD_SELECT = `id, name, off_id, image_url, presentacion, default_unit, confidence_score, is_user_created, brands(name), categories(name), product_nutrition(${NUT_COLS})`;

// Fila product_nutrition (elegida por el cerebro) → bloque de nutrición del cliente. NADA se
// inventa: campo ausente = null. allergens SÓLO se expone en 'verificado' (regla de db.js).
function nutricionDeFila(best) {
  if (!best) return null;
  const esPorcion = best.base_unit === 'porcion';
  return {
    base: esPorcion ? 'por_porcion' : 'por_100g',
    ...(esPorcion ? { porcion_g: Number(best.base_amount) } : {}),
    kcal: best.calories ?? null,
    prot: best.protein_g ?? null,
    carb: best.carbs_g ?? null,
    gras: best.fat_g ?? null,
    fibra: best.fiber_g ?? null,
    azucar: best.azucar_g ?? null,
    sodio_mg: best.sodium_mg ?? null,
    grasa_sat: best.saturated_fat_g ?? null,
    procedencia: best.nivel || 'estimado_ia',
  };
}

// Producto del catálogo (fila con product_nutrition[]) → shape del cliente. pickBestSource del
// cerebro elige la fila vigente (verificado > usuario > estimado; a igualdad, más reciente).
export function toProducto(p, brain) {
  const rows = Array.isArray(p.product_nutrition) ? p.product_nutrition : [];
  const best = (brain && brain.pickBestSource) ? brain.pickBestSource(rows) : rows[0] || null;
  const nut = nutricionDeFila(best);
  // is_user_created → badge "Tuyo" (confianza 'user'), distinto de 'verified' (Rams §2).
  const confianza = p.is_user_created ? 'user' : nut ? NIVEL_TO_CONFIANZA[nut.procedencia] || 'ai' : 'user';
  return {
    product_id: p.id,
    nombre: p.name,
    marca: p.brands?.name || '',
    categoria: p.categories?.name || '',
    presentacion: p.presentacion || '',
    unidad: p.default_unit || 'pieza',
    nutricion: nut,
    allergens: best?.nivel === 'verificado' && Array.isArray(best.allergens) ? best.allergens : [],
    confianza,
    is_user_created: !!p.is_user_created,
    codigo: p.off_id || '',
    imagen: p.image_url || '',
    image_url: p.image_url || '',
  };
}

// OFF crudo (aún no cacheado, p.ej. sin admin) → shape del cliente (verificado).
function offAProducto(off, codigo = '') {
  return {
    product_id: null,
    nombre: off.nombre,
    marca: off.marca || '',
    categoria: off.categoria || '',
    presentacion: '',
    unidad: 'g',
    nutricion: off.nutricion || null,
    allergens: Array.isArray(off.allergens) ? off.allergens : [],
    confianza: 'verified',
    is_user_created: false,
    codigo: codigo || '',
    imagen: off.image_url || '',
    image_url: off.image_url || '',
  };
}

// Dedupe de candidatos (local + externos) por barcode → product_id → nombre|marca. Conserva el
// primero (los locales se agregan antes que los externos → gana el ya cacheado).
function dedupeCandidatos(cands) {
  const seen = new Set();
  const out = [];
  for (const c of cands) {
    const key =
      (c.codigo && `c:${c.codigo}`) ||
      (c.product_id && `p:${c.product_id}`) ||
      `n:${String(c.nombre || '').toLowerCase()}|${String(c.marca || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// ---------------- I/O local (reads sobre el catálogo global; SELECT true) ----------------
async function localByBarcode(supabase, code, brain) {
  const { data } = await supabase.from('barcodes').select(`code, products(${PROD_SELECT})`).eq('code', code).maybeSingle();
  return data?.products ? toProducto(data.products, brain) : null;
}
async function localByDedup(supabase, key, brain) {
  if (!key) return [];
  const { data } = await supabase.from('products').select(PROD_SELECT).eq('dedup_key', key).limit(10);
  return (data || []).map((p) => toProducto(p, brain));
}
async function localFuzzy(supabase, nombre, brain, limit = 10) {
  const n = norm(nombre);
  if (n.length < 2) return [];
  const { data } = await supabase.from('products').select(PROD_SELECT).ilike('norm', `%${n}%`).limit(limit);
  return (data || []).map((p) => toProducto(p, brain));
}

// ---------------- rate-limit + log (external_fetch_log, server-only via admin) ----------------
async function excedioRate(admin, userId, { maxPerHour = RATE.maxPerHour } = {}) {
  // FAIL-CLOSED (Slowking): sin service_role no se puede contar/registrar el límite → NO se corre
  // el path externo (se trata como excedido). Antes devolvía false → externo SIN límite.
  if (!admin) return true;
  if (!userId) return false;
  const desde = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await admin.from('external_fetch_log').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', desde);
  return (count ?? 0) >= maxPerHour;
}
async function logFetch(admin, row) {
  if (!admin) return;
  try {
    await admin.from('external_fetch_log').insert(row);
  } catch (e) {
    console.error('external_fetch_log:', e?.message);
  }
}

// ---------------- Servicio principal ----------------
export async function buscarProducto(deps, query = {}) {
  const { supabase, admin } = deps;
  const brain = deps.brain || brainDefault; // cerebro REAL de Karpathy por defecto; fake en tests
  const fetchOFF = deps.fetchOFF || _fetchOFF;
  const cacheOFF = deps.cacheOFF || _cacheOFF;
  const searchOFFByName = deps.searchOFFByName || _searchOFFByName;
  const identificarExterno = deps.identificarExterno || _identificarExterno;
  const umbrales = deps.umbrales || UMBRALES;
  const io = {
    localByBarcode: deps.localByBarcode || ((code) => localByBarcode(supabase, code, brain)),
    localByDedup: deps.localByDedup || ((key) => localByDedup(supabase, key, brain)),
    localFuzzy: deps.localFuzzy || ((nombre) => localFuzzy(supabase, nombre, brain)),
    excedioRate: deps.excedioRate || ((uid) => excedioRate(admin, uid, deps.rate)),
    logFetch: deps.logFetch || ((row) => logFetch(admin, row)),
  };

  const barcode = String(query.barcode || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 32);
  const nombre = String(query.nombre || '').slice(0, 120);
  const userId = query.userId || null;
  const ahora = deps.now || (() => Date.now());

  // 1) LOCAL DB (cache-first). Barcode = identidad fuerte → auto directo.
  if (barcode) {
    const p = await io.localByBarcode(barcode);
    if (p) return { match: 'auto', producto: p, confianza: 1.0, source: 'db' };
  }
  if (nombre) {
    const key = brain.dedupKey ? brain.dedupKey({ nombre, marca: query.marca, presentacion: query.presentacion }) : null;
    let cands = key ? await io.localByDedup(key) : [];
    if (!cands.length) cands = await io.localFuzzy(nombre);

    // ENRIQUECER con OFF por NOMBRE: hace que productos reales (p.ej. "mayonesa mccormick light")
    // APAREZCAN aunque aún no estén en nuestra DB. Crece la DB (persiste SOLO OFF, idempotente por
    // barcode). Rate-limit + fail-closed (sin admin → se omite, no rompe). NADA de invención.
    let hadExternal = false;
    if (!(await io.excedioRate(userId))) {
      const t0 = ahora();
      const results = await searchOFFByName(nombre, { limit: 6 });
      await io.logFetch({ user_id: userId, source: 'open_food_facts', query_type: 'name', query: nombre.slice(0, 80), http_status: results.length ? 200 : 404, hit: results.length > 0, latency_ms: ahora() - t0 });
      for (const off of results) {
        let pid = null;
        if (admin) {
          try { pid = await cacheOFF(admin, userId, off.code, off); } catch (e) { console.error('cacheOFF (nombre):', e?.message); }
        }
        cands.push({ ...offAProducto(off, off.code), product_id: pid });
        hadExternal = true;
      }
      cands = dedupeCandidatos(cands);
    }

    if (cands.length) {
      const ranked = brain.rankCandidates(query, cands);
      const decision = brain.decideMatch(ranked, umbrales);
      if (decision.modo === 'auto') {
        return { match: 'auto', producto: decision.producto, confianza: decision.confianza ?? null, source: hadExternal ? 'open_food_facts' : 'db', atribucion: hadExternal ? 'Datos de Open Food Facts' : undefined };
      }
      // NUNCA esconder: aunque el cerebro decida 'no_encontrado' (confianza baja), mostramos los
      // candidatos MÁS CERCANOS como desambiguación. Solo caemos a miss si NO hay ningún candidato.
      const candidatos = decision.candidatos && decision.candidatos.length ? decision.candidatos : ranked.slice(0, 8);
      return { match: 'disambiguation', candidatos, source: hadExternal ? 'open_food_facts' : 'db', atribucion: hadExternal ? 'Datos de Open Food Facts' : undefined };
    }
    // Sin ningún candidato → miss. La UI ofrece "Agregar el tuyo" PRECARGADO con el texto escrito.
    return { match: 'miss', producto: null, candidatos: [], source: null };
  }

  // 2) EXTERNO (solo por barcode). Rate-limit + presupuesto + log.
  if (barcode) {
    if (await io.excedioRate(userId)) {
      return { match: 'miss', producto: null, candidatos: [], source: null, motivo: 'rate_limit' };
    }
    // 2a) OFF live → PERSISTIR SOLO OFF (verificado, server-only con admin). Es APPEND (cacheOFF).
    const t0 = ahora();
    const off = await fetchOFF(barcode);
    await io.logFetch({ user_id: userId, source: 'open_food_facts', query_type: 'barcode', query: barcode, http_status: off ? 200 : 404, hit: !!off, latency_ms: ahora() - t0 });
    if (off) {
      let productId = null;
      if (admin) {
        try {
          productId = await cacheOFF(admin, userId, barcode, off);
        } catch (e) {
          console.error('cacheOFF:', e?.message);
        }
      }
      const p = productId ? await io.localByBarcode(barcode) : offAProducto(off, barcode);
      return { match: 'auto', producto: p || offAProducto(off, barcode), confianza: 1.0, source: 'open_food_facts', atribucion: 'Datos de Open Food Facts' };
    }
    // 2b) OFF miss → IDENTIFICACIÓN externa: nombre/marca/imagen, NO nutrición → NO se persiste
    //     (regla: persistir SOLO OFF). Se encola la contribución (log) y se devuelve parcial.
    const t1 = ahora();
    const ident = await identificarExterno(barcode);
    await io.logFetch({ user_id: userId, source: ident?.source || 'upcitemdb', query_type: 'barcode', query: barcode, http_status: ident ? 200 : 404, hit: !!ident, latency_ms: ahora() - t1 });
    if (ident) {
      return {
        match: 'miss', // identificamos el nombre, pero la nutrición la completa el usuario (etiqueta/manual)
        producto: {
          product_id: null,
          nombre: ident.nombre,
          marca: ident.marca || '',
          categoria: '',
          presentacion: '',
          unidad: 'pieza',
          nutricion: null, // NADA de invención: sin nutrición confiable
          allergens: [],
          confianza: null,
          is_user_created: false,
          codigo: barcode,
          imagen: ident.image_url || '',
          image_url: ident.image_url || '',
        },
        source: ident.source,
        contribuible: true,
      };
    }
  }

  // 3) FALLBACK gracioso: sin resultado. El front invita a etiqueta/manual (nunca callejón).
  return { match: 'miss', producto: null, candidatos: [], source: null };
}
