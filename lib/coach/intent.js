// Detectores de intención DETERMINISTAS (Fase 7 bugfix). Un modelo chico (Haiku) a veces no elige
// la tool correcta y responde con un consejo genérico. Cuando el mensaje pide CLARAMENTE anotar/
// comprar algo, el route FUERZA tool_choice = agregar_a_lista_compras (cinturón sobre el prompt).
// Regex TIGHT → pocos falsos positivos; además la persona confirma antes de escribir y el belt de
// alérgenos sigue activo, así que el peor caso es proponer de más (inofensivo).

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ¿La persona pide AGREGAR algo a su lista de compras / súper?
export function intentListaCompras(message) {
  const m = norm(message);
  if (!m) return false;
  // Verbos claros de anotar/agregar/comprar (incluye formas MX).
  if (/\b(anota|anotame|apunta|apuntame|agregame|agregalo|anademe|anadelo|recuerdame comprar|necesito comprar|hay que comprar|tengo que comprar|falta comprar)\b/.test(m)) return true;
  // "agrega/añade/pon/mete … a/en (mi) lista|super".
  if (/\b(agrega|agregar|anade|anadir|pon|poner|mete|meter|añade)\b/.test(m) && /\b(a|en|mi)\s+(la\s+|mi\s+)?(lista|super|carrito)\b/.test(m)) return true;
  return false;
}
