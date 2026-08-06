// Despensa · "¿Qué puedo comer?" — motor DETERMINISTA. 0 IA. Genera combinaciones de la
// despensa, suma su nutrición (lib/pantry/nutrition), filtra por factibilidad + ALÉRGENOS
// SEGURO POR CONSTRUCCIÓN (lib/pantry/safety, cero fuga silenciosa) y rankea por objetivo.
// El modelo NUNCA emite cifras: aquí salen todos los números. Función PURA.
import { servingNutrition, scaleServing, sumNutrition } from './nutrition';
import { filtrarDespensaSegura } from './safety';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const OBJETIVOS = new Set(['perdida_grasa', 'hipertrofia', 'runner', 'recomposicion', 'bienestar']);

// Factible = con cantidad disponible y no caducado (hoy = 'YYYY-MM-DD', opcional).
function factible(item, hoy) {
  if (num(item.cantidad) <= 0) return false;
  if (hoy && item.caduca_en && String(item.caduca_en) < String(hoy)) return false;
  return true;
}

// Título determinista a partir de los nombres. El modelo puede re-titular después; los
// NÚMEROS no cambian (esa es la garantía).
function tituloAuto(items) {
  const nombres = items.map((it) => it.nombre || 'ingrediente');
  if (nombres.length === 1) return nombres[0];
  return `${nombres[0]} con ${nombres.slice(1).join(' y ')}`;
}

// Score determinista: cuadre vs pendientes + bonus por objetivo. Mayor = mejor.
function score(nut, pend, objetivo) {
  const kcalObj = num(pend.kcal);
  const protObj = num(pend.prot);
  const overshoot = kcalObj > 0 && nut.kcal > kcalObj ? (nut.kcal - kcalObj) / kcalObj : 0;
  const kcalFit = kcalObj > 0 ? 1 - Math.min(1, Math.abs(kcalObj - nut.kcal) / kcalObj) : 0;
  const protFit = protObj > 0 ? Math.min(1, nut.prot / protObj) : 0;
  const dens = nut.gramos ? nut.kcal / nut.gramos : 0; // kcal/g

  let bonus = 0;
  switch (objetivo) {
    case 'perdida_grasa': // proteína + fibra + saciedad (baja densidad energética)
      bonus = 2 * protFit + 0.03 * nut.fibra - 0.3 * dens;
      break;
    case 'hipertrofia': // proteína + energía suficiente
      bonus = 2.5 * protFit + 0.5 * kcalFit;
      break;
    case 'runner': // carbohidratos + cuadre
      bonus = 0.02 * nut.carb + 0.5 * kcalFit;
      break;
    case 'recomposicion': // proteína alta + cuadre
      bonus = 2 * protFit + kcalFit;
      break;
    default: // bienestar/mantener: equilibrio
      bonus = kcalFit + protFit;
  }
  return kcalFit + protFit + bonus - 1.5 * overshoot;
}

// Combinaciones deterministas: individuales + pares (acotado por el nº de ítems usables).
function combinaciones(list) {
  const combos = [];
  for (let i = 0; i < list.length; i++) {
    combos.push([list[i]]);
    for (let j = i + 1; j < list.length; j++) combos.push([list[i], list[j]]);
  }
  return combos;
}

// quePuedoComer(pendientes, pantryItems, objetivo, restricciones, opts?) -> 2-3 opciones ranked.
// opts.hoy = 'YYYY-MM-DD' (filtra caducados); opts.max = nº de opciones (default 3).
export function quePuedoComer(pendientes, pantryItems, objetivo, restricciones, opts = {}) {
  const pend = pendientes || {};
  const obj = OBJETIVOS.has(objetivo) ? objetivo : 'bienestar';
  const hoy = opts.hoy || null;
  const max = num(opts.max) > 0 ? num(opts.max) : 3;

  // 1) factibles (cantidad>0, no caducado).
  const factibles = (pantryItems || []).filter((it) => factible(it, hoy));

  // 2) FILTRO DE ALÉRGENOS seguro por construcción (lib/pantry/safety): INSEGURO siempre
  //    excluido; DESCONOCIDO según política (default 'advertir', con advertencia clara).
  const { seguros, hayAlergias, disclaimer } = filtrarDespensaSegura(factibles, restricciones, {
    politicaNoVerificado: opts.politicaNoVerificado,
  });
  // cota de 12 ítems (12 individuales + 66 pares) para no explotar en combinaciones.
  const usables = seguros.slice(0, 12);
  if (!usables.length) return [];

  // 3) nutrición por porción (V1: 1 porción por ítem). Conserva la advertencia del ítem.
  const conNut = usables.map((u) => ({ it: u.item, adv: u.advertencia, serv: servingNutrition(u.item) }));

  // 4) combinaciones → nutrición sumada (números del producto, no del modelo).
  let opciones = combinaciones(conNut).map((combo) => {
    const nut = sumNutrition(combo.map((c) => scaleServing(c.serv, 1)));
    const advertencias = [...new Set(combo.map((c) => c.adv?.texto).filter(Boolean))];
    return {
      items: combo.map((c) => ({ pantry_item_id: c.it.pantry_item_id, cantidad: 1 })),
      titulo: tituloAuto(combo.map((c) => c.it)),
      nombres: combo.map((c) => c.it.nombre).filter(Boolean), // nombres reales de los ítems usados
      kcal: nut.kcal,
      macros: { prot: nut.prot, carb: nut.carb, gras: nut.gras },
      fibra: nut.fibra,
      gramos: nut.gramos,
      usa_n_despensa: combo.length,
      procedencia: nut.procedencia, // verificado | introducido | estimado (eslabón más débil)
      // CONTEXTO de calidad (Fase 6, info de etiqueta; NO consejo médico). No altera el ranking.
      calidad: {
        nutri_score: [...new Set(combo.map((c) => c.it.nutri_score).filter(Boolean))],
        nova_group: combo.reduce((m, c) => Math.max(m, c.it.nova_group || 0), 0) || null, // el más procesado
        sellos: [...new Set(combo.flatMap((c) => (c.it.sellos && Array.isArray(c.it.sellos.activos) ? c.it.sellos.activos : [])))],
      },
      cuadre: {
        kcalPct: num(pend.kcal) > 0 ? Math.round((nut.kcal / num(pend.kcal)) * 100) : null,
        protPct: num(pend.prot) > 0 ? Math.round((nut.prot / num(pend.prot)) * 100) : null,
      },
      advertencia: advertencias.length ? advertencias : null, // alérgenos no verificados
      disclaimer, // visible cuando el usuario tiene alergias (§3)
    };
  });

  // 5) descartar las que revientan las kcal pendientes (>140%) si hay pendiente.
  const kcalObj = num(pend.kcal);
  const filtradas = opciones.filter((o) => !(kcalObj > 0 && o.kcal > kcalObj * 1.4));
  if (filtradas.length) opciones = filtradas;

  // 6) rankear por objetivo; top `max` (sin exponer el score interno).
  opciones.forEach((o) => {
    o._score = score({ kcal: o.kcal, prot: o.macros.prot, carb: o.macros.carb, gras: o.macros.gras, fibra: o.fibra, gramos: o.gramos }, pend, obj);
  });
  opciones.sort((a, b) => b._score - a._score);
  return opciones.slice(0, max).map(({ _score, ...o }) => o);
}
