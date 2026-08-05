// Despensa · CEREBRO del ProductSearchService (product-search.js del CTO lo inyecta por DI).
// Funciones PURAS, deterministas, 0 IA (plan/producto-db-cerebro.md). El CTO importa estos exports
// EXACTOS: normalizeQuery, simNombre, confidence, rankCandidates, decideMatch, normalizePresentacion,
// dedupKey, pickBestSource. NUNCA inventa datos: dato faltante = null. Reusa `norm` de ./text.
import { norm } from './text';

// normalizeQuery(input) → { nombre, marca, presentacion, categoria, barcode } (strings, trim).
// Acepta string (texto libre) u objeto. Un texto puramente numérico 8–14 dígitos = barcode.
export function normalizeQuery(input) {
  if (input && typeof input === 'object') {
    return {
      nombre: String(input.nombre || '').trim(),
      marca: String(input.marca || '').trim(),
      presentacion: String(input.presentacion || '').trim(),
      categoria: String(input.categoria || '').trim(),
      barcode: String(input.barcode || '').trim(),
    };
  }
  const s = String(input || '').trim();
  const q = { nombre: s, marca: '', presentacion: '', categoria: '', barcode: '' };
  if (/^\d{8,14}$/.test(s)) { q.barcode = s; q.nombre = ''; }
  return q;
}

// ---------- similitud de nombres (Jaccard de tokens + Levenshtein normalizado) ----------
function tokens(s) {
  return norm(s).split(' ').filter(Boolean);
}
function lev(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}
function levNorm(a, b) {
  const m = Math.max(a.length, b.length);
  return m ? 1 - lev(a, b) / m : 1;
}
function mongeElkan(A, B) {
  if (!A.length) return B.length ? 0 : 1;
  let sum = 0;
  for (const a of A) {
    let best = 0;
    for (const b of B) best = Math.max(best, levNorm(a, b));
    sum += best;
  }
  return sum / A.length;
}
// simNombre(a,b) ∈ [0,1]: 0.5·Jaccard-fuzzy (tokens que casan a levNorm≥0.8) + 0.5·Monge-Elkan.
// Orden-independiente y tolerante a typos. 'atun dolres' ≈ 'Atún Dolores'.
export function simNombre(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.length && !B.length) return 1;
  if (!A.length || !B.length) return 0;
  const used = new Set();
  let matched = 0;
  for (const x of A) {
    let bi = -1;
    let bs = 0;
    for (let j = 0; j < B.length; j++) {
      if (used.has(j)) continue;
      const s = levNorm(x, B[j]);
      if (s > bs) { bs = s; bi = j; }
    }
    if (bi >= 0 && bs >= 0.8) { used.add(bi); matched++; }
  }
  const jacc = matched / (A.length + B.length - matched);
  const me = (mongeElkan(A, B) + mongeElkan(B, A)) / 2;
  return 0.5 * jacc + 0.5 * me;
}

// ---------- presentación canónica (kg→g, L→ml, …) ----------
const UNIT = {};
function regUnit(words, canon, factor) {
  for (const w of words) UNIT[w] = { canon, factor };
}
regUnit(['g', 'gr', 'grs', 'gramo', 'gramos'], 'g', 1);
regUnit(['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos'], 'g', 1000);
regUnit(['mg'], 'g', 0.001);
regUnit(['ml', 'mililitro', 'mililitros', 'cc'], 'ml', 1);
regUnit(['l', 'lt', 'lts', 'litro', 'litros'], 'ml', 1000);
regUnit(['cl'], 'ml', 10);
regUnit(['pieza', 'piezas', 'pza', 'pzas', 'pz', 'pzs', 'unidad', 'unidades', 'und', 'u'], 'pieza', 1);
const UNIT_WORDS = new Set(Object.keys(UNIT));

// normalizePresentacion(text) → { value, unit, canonica:'value|unit' } | null (nunca inventa).
export function normalizePresentacion(text) {
  const s = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const re = /(\d+(?:[.,]\d+)?)\s*([a-z]+)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const val = parseFloat(m[1].replace(',', '.'));
    const u = UNIT[m[2]];
    if (u && Number.isFinite(val)) {
      const v = Math.round(val * u.factor * 1000) / 1000;
      return { value: v, unit: u.canon, canonica: `${v}|${u.canon}` };
    }
  }
  return null;
}

// ---------- dedup ----------
function nombreTokensBase(nombre, marcaN) {
  const marcaTok = new Set(marcaN ? marcaN.split(' ').filter(Boolean) : []);
  return norm(nombre)
    .split(' ')
    .filter((t) => t && !/\d/.test(t) && !UNIT_WORDS.has(t) && !marcaTok.has(t))
    .sort();
}
// dedupKey(product) = norm(marca) | tokensOrdenados(nombre) | presentacionCanonica.
// 'Yogurt Griego Lala 120g' == 'Lala Yogurt Griego 120 g'. Coca 355/600/2L distintas.
export function dedupKey(product) {
  const marcaN = norm(product?.marca || '');
  const pres = normalizePresentacion(product?.presentacion || product?.nombre || '');
  const nameToks = nombreTokensBase(product?.nombre || '', marcaN).join(' ');
  return `${marcaN}|${nameToks}|${pres ? pres.canonica : ''}`;
}

// ---------- confianza / decisión ----------
function eq(a, b) {
  const na = norm(a);
  return na !== '' && na === norm(b);
}
// confidence(query, cand) ∈ [0,1]. barcode exacto = 1.0; si no, 0.55·simNombre + 0.25 marca
// + 0.15 presentación + 0.05 categoría (tope 0.55 sin más señales → nombre-solo nunca auto-acepta).
export function confidence(query, cand) {
  const qb = String(query?.barcode || '').trim();
  const cb = String(cand?.barcode || '').trim();
  if (qb && cb && qb === cb) return 1;
  let s = 0.55 * simNombre(query?.nombre, cand?.nombre);
  if (query?.marca && cand?.marca && (eq(query.marca, cand.marca) || simNombre(query.marca, cand.marca) >= 0.9)) s += 0.25;
  const qp = normalizePresentacion(query?.presentacion || query?.nombre);
  const cp = normalizePresentacion(cand?.presentacion || cand?.nombre);
  if (qp && cp && qp.canonica === cp.canonica) s += 0.15;
  if (query?.categoria && cand?.categoria && eq(query.categoria, cand.categoria)) s += 0.05;
  return Math.max(0, Math.min(1, s));
}

// rankCandidates(query, cands) → candidatos con `confidence`, ordenados DESC (estable).
export function rankCandidates(query, candidates) {
  return (candidates || [])
    .map((c) => ({ ...c, confidence: confidence(query, c) }))
    .sort((a, b) => b.confidence - a.confidence);
}

// decideMatch(ranked, umbrales) → { modo, producto?, candidatos? }. `ranked` = salida de
// rankCandidates. umbrales = { auto=0.85, disambiguation=0.45 }.
//   ≥auto → 'auto' · [dis,auto) → 'disambiguation' ("¿cuál producto es?") · <dis → 'no_encontrado'.
export function decideMatch(ranked, umbrales = {}) {
  const auto = Number.isFinite(umbrales.auto) ? umbrales.auto : 0.85;
  const dis = Number.isFinite(umbrales.disambiguation) ? umbrales.disambiguation : 0.45;
  const list = ranked || [];
  const top = list[0] || null;
  if (top && top.confidence >= auto) return { modo: 'auto', producto: top, candidatos: list };
  if (top && top.confidence >= dis) return { modo: 'disambiguation', producto: null, candidatos: list.filter((c) => c.confidence >= dis) };
  return { modo: 'no_encontrado', producto: null, candidatos: [] };
}

// ---------- procedencia ----------
const NIVEL_RANK = { verificado: 3, verified: 3, introducido: 2, user: 2, usuario: 2, estimado: 1, estimado_ia: 1, ai: 1 };
function nivelRank(row) {
  return NIVEL_RANK[norm(row?.nivel || row?.procedencia || row?.confianza || '')] || 0;
}
// pickBestSource(filas): elige la fila de MAYOR confianza (verificado>usuario>estimado); a igualdad,
// la más reciente por source_updated_at. Devuelve UNA fila SIN FUSIONAR: un campo faltante (p.ej.
// fibra) queda como venga en esa fuente — nunca se rellena desde otra fuente.
export function pickBestSource(filas) {
  const list = (filas || []).filter(Boolean);
  if (!list.length) return null;
  let best = list[0];
  for (let i = 1; i < list.length; i++) {
    const r = list[i];
    const rr = nivelRank(r);
    const br = nivelRank(best);
    if (rr > br) { best = r; continue; }
    if (rr === br) {
      const rt = Date.parse(r?.source_updated_at || '') || 0;
      const bt = Date.parse(best?.source_updated_at || '') || 0;
      if (rt > bt) best = r;
    }
  }
  return best;
}
