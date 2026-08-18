// Sustituciones de producto (Fase 7). PURA y determinista. Dado un producto objetivo (con sellos
// de EXCESO / peor nutri-score / ausente en despensa) sugiere alternativas MEJORES y SEGURAS del
// pool dado (product_alternatives + despensa + catálogo). Grounded en dato REAL: nada inventado; si
// no hay alternativa mejor+segura, devuelve [] (el caller lo dice honesto).
//
// SEGURIDAD (CRÍTICO, no negociable): cada candidato pasa por lib/pantry/safety.js (clasificarItem).
// SOLO 'SEGURO' se sugiere → nunca una alternativa con un alérgeno declarado (belt de ingredientes +
// alergias declaradas + fail-safe anafiláctico, igual que el reco de Fase 6). INSEGURO/DESCONOCIDO
// se descartan (lado seguro).
import { clasificarItem } from './safety';

const NUTRI_RANK = { a: 1, b: 2, c: 3, d: 4, e: 5 };
function nutriVal(s) {
  return NUTRI_RANK[String(s || '').toLowerCase()] || 99;
}
function sellosDe(p) {
  return Array.isArray(p?.sellos?.activos) ? p.sellos.activos : [];
}

// ¿alt es NUTRICIONALMENTE mejor que target? Menos sellos de EXCESO; a igualdad, mejor nutri-score.
export function esMejor(alt, target) {
  if (!target) return true; // sin objetivo (p.ej. producto ausente) → cualquier candidato seguro sirve
  const sa = sellosDe(alt).length;
  const st = sellosDe(target).length;
  if (sa !== st) return sa < st;
  return nutriVal(alt.nutri_score) < nutriVal(target.nutri_score);
}

// ── B — "mejor por OBJETIVO" (Karpathy §B). Per-100 REAL del producto; sin datos → fallback a esMejor. ──
const numv = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// Extrae per-100 (o el snapshot comparable) del ítem; null si no hay ninguna macro utilizable.
function per100(item) {
  const n = (item && (item.nutricion || item)) || {};
  const kcal = numv(n.calories ?? n.kcal ?? n.calories_per_100g ?? n.energia);
  const prot = numv(n.protein_g ?? n.prot ?? n.proteina_g ?? n.proteina);
  const carb = numv(n.carbs_g ?? n.carb ?? n.carbohidratos_g);
  const fibra = numv(n.fiber_g ?? n.fibra ?? n.fibra_g);
  return (kcal > 0 || prot > 0 || carb > 0) ? { kcal, prot, carb, fibra } : null;
}
const protPorKcal = (x) => x.prot / Math.max(x.kcal, 1);
const densidad = (x) => x.kcal / 100;
const saciedad = (x) => protPorKcal(x) * 100 + x.fibra - densidad(x);

// Predicado QUALIFY por objetivo (Karpathy §B.2). PISO DE SEGURIDAD transversal: nunca MÁS sellos que el
// target (no empeora la calidad para ganar en la meta). El filtro de alérgenos ya ocurrió antes (SEGURO).
const CRITERIO = {
  perdida_grasa: (a, t) => saciedad(a) > saciedad(t),
  hipertrofia: (a, t) => a.prot > t.prot,
  recomposicion: (a, t) => protPorKcal(a) > protPorKcal(t),
  runner: (a, t) => a.carb > t.carb,
};
// Métrica de RANK por objetivo (mayor = mejor). bienestar/otros → 0 (cae al orden por sellos/nutri).
const METRICA = {
  perdida_grasa: (x) => saciedad(x),
  hipertrofia: (x) => x.prot,
  recomposicion: (x) => protPorKcal(x),
  runner: (x) => x.carb, // los sellos pesan aparte en el sort (desempate); aquí solo el carbo
};
// Métrica de RANK del candidato por objetivo (0 si no hay datos/criterio → cae a sellos/nutri).
function metricaDe(item, objetivo) {
  if (!METRICA[objetivo]) return 0;
  const p = per100(item);
  return p ? METRICA[objetivo](p) : 0;
}

export function esMejorPorObjetivo(alt, target, objetivo) {
  if (!CRITERIO[objetivo]) return esMejor(alt, target); // bienestar/desconocido → criterio actual
  const a = per100(alt); const t = per100(target);
  if (!a || !t) return esMejor(alt, target); // fallback sin datos (nunca inventa la cifra)
  if (sellosDe(alt).length > sellosDe(target).length) return false; // piso de seguridad: nunca más sellos
  return CRITERIO[objetivo](a, t);
}

// Razón POSITIVA y grounded por objetivo (nunca "el otro es malo"). Cae a razon() si faltan datos.
function razonPorObjetivo(alt, target, objetivo) {
  const a = per100(alt); const t = per100(target);
  const st = sellosDe(target); const sa = sellosDe(alt);
  const quitaSellos = st.filter((s) => !sa.includes(s));
  const menos = quitaSellos.length ? `, sin ${quitaSellos.map((s) => s.replace('_', ' ')).join(' ni ')}` : '';
  if (a && t) {
    if (objetivo === 'hipertrofia') return `Más proteína (${Math.round(a.prot)} vs ${Math.round(t.prot)} g/100)${menos}`;
    if (objetivo === 'perdida_grasa') return `Más saciante: más proteína y fibra por caloría${menos}`;
    if (objetivo === 'recomposicion') return `Más proteína por caloría${menos}`;
    if (objetivo === 'runner') return `Más carbohidrato para tu entreno${menos}`;
  }
  return razon(alt, target);
}

// Razón LEGIBLE y grounded de por qué es mejor (info de etiqueta; no consejo médico).
function razon(alt, target) {
  const r = [];
  if (alt.disponible) r.push('lo tienes en tu despensa');
  const st = sellosDe(target);
  const sa = sellosDe(alt);
  const quita = st.filter((s) => !sa.includes(s));
  if (quita.length) r.push(`sin ${quita.map((s) => s.replace('_', ' ')).join(' ni ')}`);
  if (target && nutriVal(alt.nutri_score) < nutriVal(target.nutri_score) && alt.nutri_score) {
    r.push(`mejor nutri-score (${String(alt.nutri_score).toUpperCase()}${target.nutri_score ? ` vs ${String(target.nutri_score).toUpperCase()}` : ''})`);
  }
  return r.join(', ') || 'alternativa segura';
}

// sustituir({ target?, candidatos, restricciones, objetivo?, opts:{max} }) → alternativas seguras y mejores.
// Con `objetivo` (perdida_grasa/hipertrofia/runner/recomposicion) rankea "mejor" SEGÚN LA META (Karpathy §B),
// con piso de seguridad (nunca más sellos) y fallback al criterio actual si faltan datos. SIN `objetivo`
// (o 'bienestar'/desconocido) → comportamiento actual, retrocompatible. El filtro de alérgenos
// (clasificarItem SOLO 'SEGURO') corre SIEMPRE ANTES del ranking: el objetivo solo REORDENA lo seguro.
export function sustituir({ target = null, candidatos = [], restricciones = [], objetivo = null, opts = {} } = {}) {
  const restr = (restricciones || []).filter(Boolean);
  const max = Number(opts.max) > 0 ? Number(opts.max) : 3;
  const usaObjetivo = !!CRITERIO[objetivo]; // solo metas con criterio propio; bienestar → clásico
  const out = [];
  for (const c of Array.isArray(candidatos) ? candidatos : []) {
    if (!c || !c.nombre) continue;
    if (target && c.product_id && target.product_id && c.product_id === target.product_id) continue; // no a sí mismo
    if (clasificarItem(c, restr).status !== 'SEGURO') continue; // SEGURIDAD: nunca un alérgeno declarado
    const mejor = usaObjetivo ? esMejorPorObjetivo(c, target, objetivo) : esMejor(c, target);
    if (!mejor) continue; // grounded: solo si mejora de verdad
    out.push({
      product_id: c.product_id || null,
      nombre: c.nombre,
      nutri_score: c.nutri_score || null,
      sellos: sellosDe(c),
      disponible: !!c.disponible,
      razon: usaObjetivo ? razonPorObjetivo(c, target, objetivo) : razon(c, target),
      _m: usaObjetivo ? metricaDe(c, objetivo) : 0,
    });
  }
  // Ranking: disponibles primero → (métrica del objetivo desc) → menos sellos → mejor nutri-score.
  out.sort((a, b) => (b.disponible - a.disponible) || (b._m - a._m) || (a.sellos.length - b.sellos.length) || (nutriVal(a.nutri_score) - nutriVal(b.nutri_score)));
  return out.slice(0, max).map(({ _m, ...o }) => o);
}
