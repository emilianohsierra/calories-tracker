// Sellos de EXCESO del etiquetado frontal mexicano (NOM-051). Función PURA, determinista.
// SOLO REPRODUCE la etiqueta regulatoria a partir de la nutrición (NO es consejo médico).
// Umbrales EXACTOS: plan/nom051-umbrales.md (Modificación NOM-051, Tabla 6, DOF).
//
// Cada sello puede quedar en 3 estados: 'exceso' | 'no' | 'indeterminado'. NADA de invención:
// si falta la nutrición necesaria para un sello → 'indeterminado' (la UI NO lo muestra; jamás se
// presenta como ausente-confirmado). Sólo los 'exceso' se pintan (como en el empaque real).
//
// Umbrales (por 100 g sólidos / 100 mL líquidos):
//   Calorías:        sólido ≥275 kcal · líquido ≥70 kcal
//   Azúcares libres: (az×4)/kcal ≥ 0.10
//   Grasas sat:      (sat×9)/kcal ≥ 0.10
//   Grasas trans:    (trans×9)/kcal ≥ 0.01
//   Sodio:           sodio_mg ≥ kcal (1 mg/kcal)  OR  (sólido y sodio_mg ≥ 300)
//
// ⚠️ LIMITACIÓN DE DATO (documentada, no es invención): OFF entrega azúcares TOTALES
//    (`sugars_100g`), no "azúcares libres". Se usa como PROXY; puede sobre-marcar alimentos con
//    azúcar natural (leche/fruta). Es dato real, con esta salvedad. El disclaimer lo cubre.

const DISCLAIMER = 'Reproduce el etiquetado frontal oficial (NOM-051). No es consejo médico.';
const CLAVES = ['calorias', 'azucares', 'grasas_saturadas', 'grasas_trans', 'sodio'];

// GATE DE AÑADIDOS (NOM-051 4.5.3): los sellos de AZÚCARES/GRASAS SAT/SODIO sólo aplican a productos
// con esos componentes AÑADIDOS. Se detectan escaneando la lista de ingredientes (normalizada). Listas
// fáciles de ampliar. NO detectar añadidos NO agrega sellos; sólo puede QUITARLOS (o suprimir por falta
// de lista). Términos multi-palabra → substring; términos de una palabra → palabra exacta o prefijo
// (≥4 letras) para evitar falsos como "sal" ⊄ "salvado".
const AZUCAR_ANADIDO = ['azucar', 'azucares', 'jarabe', 'alta fructosa', 'glucosa', 'fructosa', 'dextrosa', 'maltosa', 'sacarosa', 'miel', 'jugo concentrado', 'concentrado de jugo', 'dextrina', 'maltodextrina', 'panela', 'piloncillo'];
// 'palma' suelto NO (palmito/corazón de palma es verdura); el aceite/grasa/manteca DE palma ya lo
// cubren 'aceite'/'grasa'/'manteca'. L1.
const GRASA_ANADIDA = ['aceite', 'grasa', 'manteca', 'margarina', 'mantequilla', 'sebo', 'hidrogenad'];
const SODIO_ANADIDO = ['sal', 'sodio', 'monosodico', 'glutamato monosodico', 'benzoato de sodio', 'bicarbonato', 'nitrito', 'citrato de sodio', 'fosfato de sodio'];

// Contexto de NEGACIÓN en el token (H4): "sin azúcar añadida", "cero azúcar", "libre de sodio",
// "reducido en grasa", "bajo en sodio", "0%". Un token negado NO cuenta como añadido (el bug
// sobre-marcaba). La negación anula SÓLO el token que la contiene, no el producto completo.
const NEGACION = /(\bsin\b|\bcero\b|\blibre\b|no contiene|\breducido\b|\bbajo\b|0%)/;

function norm2(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function tieneTermino(listaNorm, terms) {
  for (const raw of listaNorm) {
    if (NEGACION.test(raw)) continue; // token en contexto de negación → no es "añadido"
    const words = raw.split(/[^a-z0-9]+/).filter(Boolean);
    for (const term of terms) {
      if (term.includes(' ')) {
        if (raw.includes(term)) return true;
      } else {
        for (const w of words) if (w === term || (term.length >= 4 && w.startsWith(term))) return true;
      }
    }
  }
  return false;
}
// Flags por-nutriente de "añadido" desde la lista de ingredientes. Exportada para test.
export function anadidosDeIngredientes(ingredientes) {
  const list = (Array.isArray(ingredientes) ? ingredientes : []).map(norm2);
  return {
    azucares: tieneTermino(list, AZUCAR_ANADIDO),
    grasas: tieneTermino(list, GRASA_ANADIDA),
    sodio: tieneTermino(list, SODIO_ANADIDO),
  };
}

function numOrNull(v) {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : null;
}

// Sello por % de energía (azúcares/sat/trans). Guarda contra kcal ausente y kcal===0.
function ratioSeal(nutriente, kcal, factor, umbral) {
  if (nutriente == null || kcal == null) return 'indeterminado';
  if (kcal === 0) {
    // Energía 0: no hay % de energía. Si el nutriente es 0 → sin exceso; si >0 el dato es
    // contradictorio (energía 0 con nutriente calórico) → indeterminado (conservador).
    return nutriente === 0 ? 'no' : 'indeterminado';
  }
  return (nutriente * factor) / kcal >= umbral ? 'exceso' : 'no';
}

function calSeal(kcal, isLiquid) {
  if (kcal == null) return 'indeterminado';
  return kcal >= (isLiquid ? 70 : 275) ? 'exceso' : 'no';
}

function sodioSeal(sodio, kcal, isLiquid) {
  if (sodio == null) return 'indeterminado';
  // BORDE PENDIENTE (DOF): "Bebidas sin calorías" usa ≥45 mg/100 mL, valor NO confirmado por texto.
  // CONSERVADOR: para líquido sin calorías, OMITIMOS el sello (indeterminado) hasta confirmación
  // visual de la Tabla 6. TODO: fijar 45 mg/100 mL tras confirmación humana del DOF.
  if (isLiquid && kcal === 0) return 'indeterminado';
  if (!isLiquid && sodio >= 300) return 'exceso'; // regla 300 mg/100 g (sólo sólidos)
  // regla 1 mg por kcal: solo con kcal>0 (a kcal 0 el umbral 0 marcaría todo → degenerado).
  if (kcal != null && kcal > 0 && sodio >= kcal) return 'exceso';
  if (kcal == null) return 'indeterminado'; // sin kcal no se puede evaluar 1 mg/kcal → conservador
  return 'no';
}

// Determina líquido vs sólido: unidad de porción/base 'ml'/'l' o categoría de bebida.
export function inferirLiquido({ serving_unit, base_unit, unidad, categoria } = {}) {
  const u = String(serving_unit || base_unit || unidad || '').toLowerCase();
  if (u === 'ml' || u === 'l') return true;
  const c = norm2(categoria); // sin acentos para no fallar con "néctar"
  return /bebida|drink|beverage|jugo|zumo|juice|nectar|batido|smoothie|bebible|refresco|soda|gaseosa|agua|water|leche|milk/.test(c);
}

// nut: nutrición por-100 (acepta claves internas kcal/azucar/grasa_sat/grasa_trans/sodio_mg o
// canónicas calories_per_100g/sugars_g/…). opts: { isLiquid|tipo, esExcepcion, ingredientes }.
// `ingredientes` = string[] (lista del producto) → gate de añadidos por-nutriente (§ arriba).
export function sellosNOM051(nut, opts = {}) {
  const isLiquid = opts.isLiquid === true || opts.tipo === 'liquido';

  // Excepciones oficiales (4.5.3.3: fórmulas infantiles, ingredientes individuales…) donde el
  // caller las detecte → sin sellos. Si no es detectable, no se fuerza nada (se computa Tabla 6).
  if (opts.esExcepcion) {
    const vacio = Object.fromEntries(CLAVES.map((k) => [k, 'no']));
    return { ...vacio, activos: [], indeterminados: [], isLiquid, exceptuado: true, disclaimer: DISCLAIMER };
  }

  const kcal = numOrNull(nut?.kcal ?? nut?.calories_per_100g ?? nut?.calories);
  const azucar = numOrNull(nut?.azucar ?? nut?.sugars_g ?? nut?.azucares_libres_g);
  const sat = numOrNull(nut?.grasa_sat ?? nut?.saturated_fat_g);
  const trans = numOrNull(nut?.grasa_trans ?? nut?.trans_fat_g);
  const sodio = numOrNull(nut?.sodio_mg ?? nut?.sodium_mg);

  const sellos = {
    // NOTA edge calorías-sin-añadidos: Ada indica que calorías se rige por energía; el trato fino
    // "calorías sin añadidos" NO está confirmado en el texto integral → se computa por energía y se
    // deja este TODO. TODO: confirmar edge calorías-sin-añadidos contra el DOF antes de afinar.
    calorias: calSeal(kcal, isLiquid),
    azucares: ratioSeal(azucar, kcal, 4, 0.1),
    grasas_saturadas: ratioSeal(sat, kcal, 9, 0.1),
    grasas_trans: ratioSeal(trans, kcal, 9, 0.01),
    sodio: sodioSeal(sodio, kcal, isLiquid),
  };

  // GATE DE AÑADIDOS (4.5.3) — H1: los sellos de AZÚCARES/GRASAS SAT/SODIO sólo aplican si esos
  // componentes están AÑADIDOS (detectado en la lista de ingredientes). CALORÍAS NO lleva gate.
  //  · sin lista de ingredientes  → los 3 sellos se SUPRIMEN (indeterminado): no arriesgar falso
  //    positivo en naturales (leche, yogur natural, jugo 100%).
  //  · con lista y NO añadido      → 'no' (no aplica el sello, como la etiqueta real).
  //  · con lista y añadido         → se conserva el 'exceso' de la Tabla 6.
  // Dirección: el gate SÓLO puede quitar/suprimir; nunca agrega un sello. (Grasas TRANS también
  // dependen de "grasas añadidas" → mismo flag que saturadas.)
  const ingr = Array.isArray(opts.ingredientes) ? opts.ingredientes : null;
  const tieneLista = !!(ingr && ingr.length);
  const anadidos = tieneLista ? anadidosDeIngredientes(ingr) : { azucares: false, grasas: false, sodio: false };
  const GATE = [['azucares', 'azucares'], ['grasas_saturadas', 'grasas'], ['grasas_trans', 'grasas'], ['sodio', 'sodio']];
  for (const [sello, nut] of GATE) {
    if (sellos[sello] !== 'exceso') continue; // el gate sólo QUITA excesos, nunca agrega
    if (!tieneLista) { sellos[sello] = 'indeterminado'; continue; } // sin lista → suprimir
    if (!anadidos[nut]) sellos[sello] = 'no'; // hay lista y NO está añadido → sin sello
  }

  const activos = CLAVES.filter((k) => sellos[k] === 'exceso');
  const indeterminados = CLAVES.filter((k) => sellos[k] === 'indeterminado');
  return { ...sellos, activos, indeterminados, isLiquid, disclaimer: DISCLAIMER };
}
