// data_quality — cuán COMPLETO/confiable es un producto (≠ confidence_score, que mide el match).
// Función PURA y determinista. Señales ponderadas → score 0..1 → nivel enum. Regla de oro: un
// 'estimated'/'incomplete' NUNCA se presenta como exacto (la UI lo muestra con su badge).
//
// Pesos (suman 1.0): barcode .20 · imagen .15 · nutrición-completa .25 · marca .10 ·
//                    ingredientes .10 · fuente-confiable .20 (verificado 1 / usuario .5 / estimado .25)

function esVerificado(c) {
  return c === 'verified' || c === 'verificado';
}
function esUsuario(c) {
  return c === 'user' || c === 'usuario';
}
function esEstimado(c) {
  return c === 'ai' || c === 'estimado_ia' || c === 'estimado';
}

export function computeDataQuality(product) {
  const p = product || {};
  const nut = p.nutricion || {};
  const conf = p.confianza || p.nivel || '';
  const usuario = esUsuario(conf) || !!p.is_user_created;
  const verificado = esVerificado(conf);
  const estimado = esEstimado(conf);

  const tieneBarcode = !!(p.codigo || p.off_id || p.barcode);
  const tieneImagen = !!(p.image_url || p.imagen);
  const macros = [nut.kcal, nut.prot, nut.carb, nut.gras];
  const nutricionCompleta = macros.every((v) => v != null);
  const tieneMarca = !!p.marca;
  const tieneIngredientes = Array.isArray(p.ingredientes) ? p.ingredientes.length > 0 : !!p.tiene_ingredientes;
  const fuente = verificado ? 1 : usuario ? 0.5 : estimado ? 0.25 : 0;

  let score =
    0.2 * (tieneBarcode ? 1 : 0) +
    0.15 * (tieneImagen ? 1 : 0) +
    0.25 * (nutricionCompleta ? 1 : 0) +
    0.1 * (tieneMarca ? 1 : 0) +
    0.1 * (tieneIngredientes ? 1 : 0) +
    0.2 * fuente;
  score = Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000;

  let level;
  if (!nutricionCompleta || score < 0.3) level = 'incomplete';
  else if (verificado && score >= 0.8) level = 'verified';
  else if (usuario && score >= 0.5) level = 'community';
  else if (estimado || score < 0.5) level = 'estimated';
  else level = 'community';

  return { score, level };
}
