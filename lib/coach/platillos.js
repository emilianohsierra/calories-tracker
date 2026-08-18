// Recomendaciones v2 · A — PLATILLOS SIN DESPENSA. Catálogo MX en CONFIG versionada (patrón curriculum.js;
// contenido de Karpathy, plan/recomendaciones-v2-nutricion.md, editable por PR, deploy-safe, sin migración).
// Selección DETERMINISTA (0 IA, $0): reusa el score por macros del motor vivo (suggest.js puntuarPorMacros)
// + cinturón de alérgenos por platillo (safety.js clasificarItem, SOLO 'SEGURO', fail-safe anafiláctico) +
// descarte >140% kcal. Cifras = RANGOS de porción típica (procedencia:'aproximado', se muestran con "~"),
// nunca inventadas/exactas; los pendientes vienen del motor. TCA-safe: añadir-no-restringir, cero peso/culpa.
import { puntuarPorMacros, OBJETIVOS } from '../pantry/suggest';
import { clasificarItem } from '../pantry/safety';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const mid = (r) => (Array.isArray(r) ? (num(r[0]) + num(r[1])) / 2 : num(r));

// Catálogo semilla (~17). ingredientes = términos REALES para el cinturón léxico de alérgenos (incluye el
// alérgeno por su palabra: huevo/leche/queso/atun/pescado…). alergenos = grupos declarados (belt extra).
export const PLATILLOS_MX = [
  { id: 'huevos', nombre: 'Huevos revueltos (2)', porcion: '2 pza', kcal: [140, 160], prot: [12, 14], carb: [1, 2], gras: [10, 11], fibra: [0, 0], tags: ['alto_proteina', 'desayuno'], ingredientes: ['huevo'], alergenos: ['huevo'] },
  { id: 'pollo_asado', nombre: 'Pechuga de pollo asada', porcion: '120–150 g', kcal: [165, 250], prot: [31, 46], carb: [0, 0], gras: [4, 6], fibra: [0, 0], tags: ['alto_proteina', 'bajo_densidad'], ingredientes: ['pollo'], alergenos: [] },
  { id: 'atun_agua', nombre: 'Atún en agua (drenado)', porcion: '1 lata ~120 g', kcal: [110, 130], prot: [25, 28], carb: [0, 0], gras: [1, 2], fibra: [0, 0], tags: ['alto_proteina', 'bajo_densidad'], ingredientes: ['atun', 'pescado'], alergenos: ['pescado'] },
  { id: 'frijol', nombre: 'Frijoles de la olla', porcion: '1 taza ~130 g', kcal: [110, 150], prot: [7, 9], carb: [20, 27], gras: [0.5, 1], fibra: [7, 9], tags: ['alto_fibra', 'proteina_vegetal'], ingredientes: ['frijol'], alergenos: [] },
  { id: 'taco_pollo', nombre: 'Taco de pollo (maíz)', porcion: '1 taco', kcal: [120, 160], prot: [10, 13], carb: [12, 16], gras: [3, 6], fibra: [1, 2], tags: ['proteina', 'carbo_moderado'], ingredientes: ['tortilla de maiz', 'pollo'], alergenos: [] },
  { id: 'avena_agua', nombre: 'Avena con agua', porcion: '40 g hojuelas', kcal: [145, 160], prot: [5, 6], carb: [26, 28], gras: [3, 3], fibra: [4, 4], tags: ['alto_carbo', 'fibra', 'desayuno'], ingredientes: ['avena'], alergenos: ['gluten'] },
  { id: 'avena_leche', nombre: 'Avena con leche + fruta', porcion: '1 tazón', kcal: [250, 320], prot: [9, 13], carb: [40, 50], gras: [5, 8], fibra: [5, 7], tags: ['alto_carbo', 'fibra', 'desayuno'], ingredientes: ['avena', 'leche', 'fruta'], alergenos: ['gluten', 'lacteo'] },
  { id: 'yogur_griego', nombre: 'Yogur griego natural', porcion: '150 g', kcal: [90, 140], prot: [13, 17], carb: [6, 8], gras: [0, 5], fibra: [0, 0], tags: ['alto_proteina'], ingredientes: ['yogur', 'leche'], alergenos: ['lacteo'] },
  { id: 'quesadilla', nombre: 'Quesadilla (maíz + queso)', porcion: '1 pza', kcal: [180, 230], prot: [9, 12], carb: [12, 16], gras: [9, 13], fibra: [1, 2], tags: ['proteina', 'carbo_moderado'], ingredientes: ['tortilla de maiz', 'queso', 'leche'], alergenos: ['lacteo'] },
  { id: 'chilaquiles', nombre: 'Chilaquiles verdes c/ pollo o huevo', porcion: '1 plato', kcal: [400, 550], prot: [20, 30], carb: [35, 50], gras: [15, 25], fibra: [4, 6], tags: ['comida_fuerte'], ingredientes: ['tortilla de maiz', 'salsa verde', 'pollo', 'huevo'], alergenos: ['huevo'] },
  { id: 'tacos_pastor', nombre: 'Tacos al pastor (2)', porcion: '2 tacos', kcal: [300, 400], prot: [18, 24], carb: [28, 36], gras: [12, 18], fibra: [3, 5], tags: ['comida_fuerte'], ingredientes: ['tortilla de maiz', 'cerdo', 'piña'], alergenos: [] },
  { id: 'ensalada_atun', nombre: 'Ensalada de atún', porcion: '1 plato', kcal: [200, 300], prot: [22, 30], carb: [8, 15], gras: [8, 14], fibra: [3, 5], tags: ['alto_proteina', 'verdura'], ingredientes: ['atun', 'pescado', 'mayonesa', 'huevo', 'verdura'], alergenos: ['pescado', 'huevo'] },
  { id: 'tortilla', nombre: 'Tortilla de maíz nixtamalizada', porcion: '1 pza ~30 g', kcal: [50, 65], prot: [1.4, 1.4], carb: [11, 13], gras: [0.5, 0.5], fibra: [1, 2], tags: ['carbo', 'guarnicion'], ingredientes: ['tortilla de maiz'], alergenos: [] },
  { id: 'arroz', nombre: 'Arroz cocido', porcion: '½ taza ~90 g', kcal: [110, 130], prot: [2, 3], carb: [24, 28], gras: [0.3, 0.3], fibra: [0.5, 0.5], tags: ['carbo', 'guarnicion'], ingredientes: ['arroz'], alergenos: [] },
  { id: 'nopales', nombre: 'Nopales asados', porcion: '1 taza', kcal: [15, 30], prot: [1, 2], carb: [3, 5], gras: [0.2, 0.2], fibra: [2, 3], tags: ['verdura', 'bajo_densidad', 'fibra'], ingredientes: ['nopal'], alergenos: [] },
  { id: 'aguacate', nombre: 'Aguacate', porcion: '½ pza ~70 g', kcal: [110, 120], prot: [1.4, 1.4], carb: [6, 6], gras: [10, 11], fibra: [5, 5], tags: ['grasa_saludable', 'fibra'], ingredientes: ['aguacate'], alergenos: [] },
  { id: 'comida_corrida', nombre: 'Comida corrida (sopa+guisado+arroz+tortillas)', porcion: '1 comida', kcal: [600, 900], prot: [25, 40], carb: [70, 110], gras: [20, 35], fibra: [6, 10], tags: ['comida_fuerte', 'variable'], ingredientes: ['sopa', 'guisado', 'arroz', 'tortilla de maiz'], alergenos: [] },
];

// Pseudo-ítem para el cinturón: 'verified' + ingredientes reales → clasificarItem excluye si hay alérgeno
// (léxico) y da SEGURO solo si limpio (no sobre-excluye por fail-safe anafiláctico gracias a la señal).
function comoItem(p) {
  return { nombre: p.nombre, ingredientes: p.ingredientes, allergens: p.alergenos, confianza: 'verified' };
}

// Razón grounded y POSITIVA (añadir-no-restringir; cero peso/culpa; nunca "para bajar"/"come menos").
function razonPlatillo(p, pend, objetivo) {
  const protMid = mid(p.prot);
  const protPend = num(pend.prot);
  if (objetivo === 'runner' && p.tags.includes('alto_carbo')) return 'Carbohidratos para tu entreno.';
  if (protPend >= 25 && protMid >= 15) return `Te aporta ~${Math.round(protMid)} g de proteína, de lo que te falta hoy.`;
  if (p.tags.includes('alto_fibra') || p.tags.includes('bajo_densidad')) return 'Suma fibra y saciedad a tu día.';
  if (p.tags.includes('alto_carbo')) return 'Buena fuente de energía para hoy.';
  return 'Encaja con lo que te falta hoy.';
}

// Da forma de OPCIÓN (compatible con suggest.js + rangos honestos aproximados).
function aOpcion(p, nut, pend, objetivo) {
  return {
    id: p.id,
    titulo: p.nombre,
    nombres: [p.nombre],
    porcion: p.porcion,
    kcal: Math.round(nut.kcal), // MID del rango (aproximado)
    macros: { prot: Math.round(nut.prot), carb: Math.round(nut.carb), gras: Math.round(nut.gras) },
    fibra: Math.round(nut.fibra),
    rangos: { kcal: p.kcal, prot: p.prot, carb: p.carb, gras: p.gras, fibra: p.fibra }, // "~" honesto
    procedencia: 'aproximado',
    estimado: true, // macros en RANGO → la UI los pinta con "~"
    fuente: 'catalogo',
    tags: p.tags,
    cuadre: {
      kcalPct: num(pend.kcal) > 0 ? Math.round((nut.kcal / num(pend.kcal)) * 100) : null,
      protPct: num(pend.prot) > 0 ? Math.round((nut.prot / num(pend.prot)) * 100) : null,
    },
    porque: razonPlatillo(p, pend, objetivo),
    disclaimer: 'Valores aproximados de una porción típica. Ajústalos al registrar.',
  };
}

// seleccionarPlatillos(pendientes, objetivo, restricciones, opts?) → 1-3 platillos que encajan con lo que
// FALTA hoy (pendientes del motor), sin despensa. Determinista, $0. opts.max (default 3).
export function seleccionarPlatillos(pendientes, objetivo, restricciones, opts = {}) {
  const pend = pendientes || {};
  const obj = OBJETIVOS.has(objetivo) ? objetivo : 'bienestar';
  const restr = (restricciones || []).filter(Boolean);
  const max = num(opts.max) > 0 ? num(opts.max) : 3;
  const kcalObj = num(pend.kcal);

  const rank = [];
  for (const p of PLATILLOS_MX) {
    // 0) SEGURIDAD (Slowking, riesgo ANAFILÁCTICO): un platillo de contenido NO verificable — tag 'variable',
    //    ingredientes GENÉRICOS ('sopa'/'guisado' que no disparan el cinturón léxico) — NUNCA se recomienda a
    //    quien tiene restricciones (un guisado/mole puede llevar maní/nueces/ajonjolí). Se sigue ofreciendo a
    //    usuarios SIN restricciones. Va ANTES del cinturón (los genéricos lo burlarían dando SEGURO falso).
    if (restr.length && p.tags.includes('variable')) continue;
    // 1) ALÉRGENOS: SOLO 'SEGURO' (mismo motor que la despensa; INSEGURO/DESCONOCIDO fuera).
    if (clasificarItem(comoItem(p), restr).status !== 'SEGURO') continue;
    // 2) OVERSHOOT: mid(kcal) > pendiente.kcal * 1.4 → descarta (si hay pendiente de kcal).
    const nut = { kcal: mid(p.kcal), prot: mid(p.prot), carb: mid(p.carb), gras: mid(p.gras), fibra: mid(p.fibra) };
    if (kcalObj > 0 && nut.kcal > kcalObj * 1.4) continue;
    // 3) SCORE (motor compartido). gramos ausente → el término de densidad se anula (conservador).
    rank.push({ p, nut, _score: puntuarPorMacros(nut, pend, obj) });
  }
  rank.sort((a, b) => b._score - a._score);
  return rank.slice(0, max).map(({ p, nut }) => aOpcion(p, nut, pend, obj));
}
