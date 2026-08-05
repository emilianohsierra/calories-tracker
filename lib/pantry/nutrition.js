// Despensa · cálculo DETERMINISTA de nutrición. 0 IA. Cada valor conserva PROCEDENCIA
// (verificado | introducido | estimado). El modelo NUNCA emite cifras: salen de aquí, de la
// nutrición del producto (products / nutricion_snapshot). Funciones PURAS.
//
// Contrato de un pantryItem (a acordar con el CTO — nombres de products/pantry_items):
//   { pantry_item_id, nombre, cantidad, unidad, caduca_en?, ingredientes?:string[],
//     nutricion: { base:'por_100g'|'por_porcion', porcion_g?, kcal, prot|proteina_g,
//                  carb|carbs_g, gras|grasa_g, fibra|fibra_g?, procedencia } } }

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Orden de confianza para el "eslabón más débil".
const RANK = { verificado: 2, introducido: 1, estimado: 0 };
function normProc(p) {
  if (p === 'estimado_ia') return 'estimado'; // subtipo de etiqueta → agrega como estimado
  return p in RANK ? p : 'estimado';
}
// Procedencia agregada = la MÁS BAJA de sus componentes (regla del eslabón más débil, §6).
export function weakestProcedencia(list) {
  if (!list || !list.length) return 'estimado';
  let worst = 'verificado';
  for (const p of list) {
    const key = normProc(p);
    if (RANK[key] < RANK[worst]) worst = key;
  }
  return worst;
}

// Nutrición de UNA porción del ítem, determinista. Devuelve `gramos` (para densidad) y la
// procedencia EFECTIVA (degrada a 'estimado' si hubo que asumir la porción).
export function servingNutrition(item) {
  const n = (item && item.nutricion) || {};
  const base = n.base === 'por_porcion' ? 'por_porcion' : 'por_100g';
  let factor;
  let gramos = null;
  let proc = normProc(n.procedencia);

  if (base === 'por_porcion') {
    factor = 1; // los macros ya son por porción
    gramos = num(n.porcion_g) > 0 ? num(n.porcion_g) : null;
  } else if (num(n.porcion_g) > 0) {
    gramos = num(n.porcion_g);
    factor = gramos / 100; // macros por 100 g escalados a la porción
  } else {
    gramos = 100; // SUPUESTO: 100 g como porción → degrada procedencia (§6, cantidad asumida)
    factor = 1;
    proc = 'estimado';
  }

  return {
    kcal: num(n.kcal) * factor,
    prot: num(n.prot ?? n.proteina_g) * factor,
    carb: num(n.carb ?? n.carbs_g) * factor,
    gras: num(n.gras ?? n.grasa_g) * factor,
    fibra: num(n.fibra ?? n.fibra_g) * factor,
    gramos,
    procedencia: proc,
  };
}

// Escala una porción por `cantidad` (nº de porciones a usar).
export function scaleServing(s, cantidad) {
  const c = num(cantidad) > 0 ? num(cantidad) : 1;
  return {
    kcal: s.kcal * c, prot: s.prot * c, carb: s.carb * c, gras: s.gras * c, fibra: s.fibra * c,
    gramos: s.gramos != null ? s.gramos * c : null,
    procedencia: s.procedencia,
  };
}

// Suma una lista de porciones (ya escaladas) → agregado redondeado con procedencia mínima.
export function sumNutrition(parts) {
  const acc = (parts || []).reduce(
    (a, p) => ({
      kcal: a.kcal + num(p.kcal), prot: a.prot + num(p.prot), carb: a.carb + num(p.carb),
      gras: a.gras + num(p.gras), fibra: a.fibra + num(p.fibra), gramos: a.gramos + num(p.gramos),
    }),
    { kcal: 0, prot: 0, carb: 0, gras: 0, fibra: 0, gramos: 0 }
  );
  return {
    kcal: Math.round(acc.kcal), prot: Math.round(acc.prot), carb: Math.round(acc.carb),
    gras: Math.round(acc.gras), fibra: Math.round(acc.fibra),
    gramos: acc.gramos > 0 ? Math.round(acc.gramos) : null,
    procedencia: weakestProcedencia((parts || []).map((p) => p.procedencia)),
  };
}
