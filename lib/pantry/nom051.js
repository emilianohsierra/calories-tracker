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

// Sello CALÓRICO (Karpathy §1-2): líquido ≥70/100 mL · sólido ≥275/100 g. Forma 'indeterminada' →
// FALLBACK: evaluar contra AMBOS umbrales y asertar SOLO si coinciden; 70≤kcal<275 → 'indeterminado'
// ("no determinable por forma"; nunca se adivina la forma). Sin kcal → 'indeterminado'.
function calSeal(kcal, forma) {
  if (kcal == null) return 'indeterminado';
  if (forma === 'liquido') return kcal >= 70 ? 'exceso' : 'no';
  if (forma === 'solido') return kcal >= 275 ? 'exceso' : 'no';
  // indeterminada: ambos umbrales
  if (kcal < 70) return 'no';        // < 70 → ambos "no"
  if (kcal >= 275) return 'exceso';  // ≥ 275 → ambos "exceso"
  return 'indeterminado';            // 70 ≤ kcal < 275 → no determinable por forma
}

// Sello SODIO (Karpathy §1 fórmula, §18): ≥1 mg/kcal (kcal>0) O ≥300 mg/100 (g o mL — forma-independiente).
// Sin sodio → 'indeterminado'; sin kcal y sodio<300 → 'indeterminado' (no se puede evaluar mg/kcal).
function sodioSeal(sodio, kcal) {
  if (sodio == null) return 'indeterminado';
  if (sodio >= 300) return 'exceso';                 // ≥300 mg/100 (g o mL), aplica a ambas formas
  if (kcal == null) return 'indeterminado';          // sin kcal no se evalúa mg/kcal → conservador
  if (kcal > 0 && sodio >= kcal) return 'exceso';    // ≥1 mg/kcal
  return 'no';
}

// Detección de FORMA física para el umbral calórico (Karpathy §2): 'liquido' | 'solido' | 'indeterminada'.
// Orden (fuerte→débil): (1) tipo/type explícito, (2) unidad de volumen (mL/L) → líquido, (3) categoría/tags
// de bebida → líquido, (4) unidad en gramos → sólido. Sin ninguna señal → 'indeterminada' (NO se adivina:
// el sello calórico se resuelve por el fallback de ambos umbrales en calSeal).
const RE_BEBIDA = /bebida|drink|beverage|jugo|zumo|juice|nectar|batido|smoothie|licuado|bebible|refresco|soda|gaseosa|agua|water|leche|milk|horchata|atole|kombucha|cerveza|vino/;
const RE_JUGO = /jugo|zumo|juice|nectar/; // los azúcares del jugo/néctar cuentan como LIBRES (WHO/NOM)
const arrTags = (categoria, tags) => (Array.isArray(tags) ? tags : (Array.isArray(categoria) ? categoria : []));
const UNID_VOL = ['ml', 'cl', 'l', 'lt', 'litro', 'litros', 'mililitro', 'mililitros'];
const UNID_MASA = ['g', 'gr', 'kg', 'gramo', 'gramos', 'kilo', 'kilos', 'kilogramo', 'kilogramos'];

export function inferirForma({ serving_unit, base_unit, unidad, categoria, tipo, type, tags } = {}) {
  const t = norm2(tipo || type);
  if (/liquid|bebida|beverage|drink/.test(t)) return 'liquido';
  if (/solid/.test(t)) return 'solido';
  const u = String(serving_unit || base_unit || unidad || '').toLowerCase().trim();
  if (UNID_VOL.includes(u)) return 'liquido';
  if (RE_BEBIDA.test(norm2(categoria))) return 'liquido';
  for (const g of arrTags(categoria, tags)) if (RE_BEBIDA.test(norm2(g))) return 'liquido';
  if (UNID_MASA.includes(u)) return 'solido';
  return 'indeterminada';
}

// ¿es jugo/néctar? (para el gate de azúcares LIBRES). Determinista, por categoría/tags.
export function esJugo({ categoria, tags } = {}) {
  if (RE_JUGO.test(norm2(categoria))) return true;
  for (const g of arrTags(categoria, tags)) if (RE_JUGO.test(norm2(g))) return true;
  return false;
}

// Back-compat: boolean líquido (true SOLO si la forma es 'liquido'; 'indeterminada' → false).
export function inferirLiquido(x) { return inferirForma(x) === 'liquido'; }

// Mono-ingrediente natural (agua/leche sin añadidos) → exención NOM-051 de sellos de AÑADIDOS: no
// asertar; marcar revisar_exencion (Karpathy §70/§83). Lista ampliable.
const NATURAL_MONO = ['agua', 'leche'];
function esMonoIngredienteNatural(ingr) {
  const list = (Array.isArray(ingr) ? ingr : []).map(norm2).filter(Boolean);
  if (list.length !== 1) return false;
  return NATURAL_MONO.some((n) => list[0].includes(n));
}
// ¿la lista de ingredientes indica jugo/néctar? → sus azúcares cuentan como LIBRES (WHO/NOM).
const RE_JUGO_INGR = /(^|[^a-z])(jugo|zumo|nectar)([^a-z]|$)/;
function tieneJugoIngrediente(ingr) {
  return (Array.isArray(ingr) ? ingr : []).some((i) => RE_JUGO_INGR.test(norm2(i)));
}

// nut: nutrición por-100 (claves internas kcal/azucar/grasa_sat/grasa_trans/sodio_mg o canónicas
// calories_per_100g/sugars_g/…). opts: { forma?|isLiquid|tipo, esJugo?, esExcepcion, ingredientes }.
// `forma` ∈ 'liquido'|'solido'|'indeterminada' (inferirForma). `esJugo` = azúcares libres del jugo/néctar.
export function sellosNOM051(nut, opts = {}) {
  const forma = opts.forma
    || (opts.isLiquid === true || opts.tipo === 'liquido' ? 'liquido'
      : opts.isLiquid === false || opts.tipo === 'solido' ? 'solido' : 'indeterminada');

  // Excepciones oficiales (4.5.3.3: fórmulas infantiles…) donde el caller las detecte → sin sellos.
  if (opts.esExcepcion) {
    const vacio = Object.fromEntries(CLAVES.map((k) => [k, 'no']));
    return { ...vacio, activos: [], indeterminados: [], forma, isLiquid: forma === 'liquido', exceptuado: true, revisar_exencion: false, disclaimer: DISCLAIMER };
  }

  const kcal = numOrNull(nut?.kcal ?? nut?.calories_per_100g ?? nut?.calories);
  const azucar = numOrNull(nut?.azucar ?? nut?.sugars_g ?? nut?.azucares_libres_g);
  const sat = numOrNull(nut?.grasa_sat ?? nut?.saturated_fat_g);
  const trans = numOrNull(nut?.grasa_trans ?? nut?.trans_fat_g);
  const sodio = numOrNull(nut?.sodio_mg ?? nut?.sodium_mg);

  const sellos = {
    calorias: calSeal(kcal, forma), // único que cambia por forma; forma indeterminada → fallback ambos umbrales
    azucares: ratioSeal(azucar, kcal, 4, 0.1),
    grasas_saturadas: ratioSeal(sat, kcal, 9, 0.1),
    grasas_trans: ratioSeal(trans, kcal, 9, 0.01),
    sodio: sodioSeal(sodio, kcal),
  };

  const ingr = Array.isArray(opts.ingredientes) ? opts.ingredientes : null;
  const tieneLista = !!(ingr && ingr.length);
  const anadidos = tieneLista ? anadidosDeIngredientes(ingr) : { azucares: false, grasas: false, sodio: false };
  const jugo = opts.esJugo === true || tieneJugoIngrediente(ingr); // azúcares LIBRES del jugo/néctar
  const monoNatural = esMonoIngredienteNatural(ingr);
  let revisar_exencion = false;

  // AZÚCARES: exceso SOLO con azúcares LIBRES (añadidos en la lista O jugo/néctar). Sin confirmarlo (sin
  // lista y no jugo) → indeterminado (evita falso positivo por azúcar intrínseco: leche/fruta).
  if (sellos.azucares === 'exceso') {
    if (jugo || (tieneLista && anadidos.azucares)) { /* libres confirmados → conserva exceso */ }
    else if (!tieneLista) sellos.azucares = 'indeterminado';
    else sellos.azucares = 'no'; // lista sin añadidos y no jugo → intrínseco → sin sello
  }

  // GRASAS SAT/TRANS: dependen de grasa AÑADIDA. Mono-ingrediente natural (leche) → exención: no asertar,
  // marcar revisar_exencion (no afirmar de más).
  for (const sello of ['grasas_saturadas', 'grasas_trans']) {
    if (sellos[sello] !== 'exceso') continue;
    if (!tieneLista) { sellos[sello] = 'indeterminado'; continue; }
    if (anadidos.grasas) continue; // grasa añadida → conserva exceso
    if (monoNatural) { sellos[sello] = 'indeterminado'; revisar_exencion = true; }
    else sellos[sello] = 'no';
  }

  // SODIO: depende de sodio AÑADIDO (mismo gate). Mono-natural → exención (revisar).
  if (sellos.sodio === 'exceso') {
    if (!tieneLista) sellos.sodio = 'indeterminado';
    else if (!anadidos.sodio) {
      if (monoNatural) { sellos.sodio = 'indeterminado'; revisar_exencion = true; }
      else sellos.sodio = 'no';
    }
  }

  const activos = CLAVES.filter((k) => sellos[k] === 'exceso');
  const indeterminados = CLAVES.filter((k) => sellos[k] === 'indeterminado');
  return { ...sellos, activos, indeterminados, forma, isLiquid: forma === 'liquido', revisar_exencion, disclaimer: DISCLAIMER };
}
