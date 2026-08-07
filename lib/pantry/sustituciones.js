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

// sustituir({ target?, candidatos, restricciones, opts:{max} }) → alternativas seguras y mejores.
export function sustituir({ target = null, candidatos = [], restricciones = [], opts = {} } = {}) {
  const restr = (restricciones || []).filter(Boolean);
  const max = Number(opts.max) > 0 ? Number(opts.max) : 3;
  const out = [];
  for (const c of Array.isArray(candidatos) ? candidatos : []) {
    if (!c || !c.nombre) continue;
    if (target && c.product_id && target.product_id && c.product_id === target.product_id) continue; // no a sí mismo
    if (clasificarItem(c, restr).status !== 'SEGURO') continue; // SEGURIDAD: nunca un alérgeno declarado
    if (!esMejor(c, target)) continue; // grounded: solo si mejora de verdad
    out.push({
      product_id: c.product_id || null,
      nombre: c.nombre,
      nutri_score: c.nutri_score || null,
      sellos: sellosDe(c),
      disponible: !!c.disponible,
      razon: razon(c, target),
    });
  }
  // Ranking: disponibles primero → menos sellos → mejor nutri-score.
  out.sort((a, b) => (b.disponible - a.disponible) || (a.sellos.length - b.sellos.length) || (nutriVal(a.nutri_score) - nutriVal(b.nutri_score)));
  return out.slice(0, max);
}
