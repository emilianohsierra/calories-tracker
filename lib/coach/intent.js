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
  if (/\b(agrega|agregar|anade|anadir|pon|poner|mete|meter|añade)\b/.test(m) && /\b(a|en|mi)\s+(la\s+|mi\s+|el\s+)?(lista|super|carrito)\b/.test(m)) return true;
  return false;
}

// Extrae el/los PRODUCTO(s) de un mensaje de intención de lista, para escribirlos SIN depender del
// modelo. Determinista: quita el prefijo de intención + el sufijo "a/en mi lista/súper" + cortesías,
// y divide por conectores. Devuelve [] si no queda nada claro (→ el route cae al tool-loop normal).
export function extraerItemsLista(message) {
  let s = String(message || '').trim();
  if (!s) return [];
  // Prefijos de intención (con "que necesito/ocupo/me falta/comprar" opcional). Orden largo→corto.
  const prefijos = [
    /^.*?\b(an[oó]tame|anota|ap[uú]ntame|apunta)\b\s*(que\s+)?(necesito|ocupo|me\s+falta[n]?|comprar[eé]?|hay\s+que\s+comprar|tengo\s+que\s+comprar)?\s*/i,
    /^.*?\b(agr[eé]game|agr[eé]galo|a[ñn][aá]deme|a[ñn][aá]delo|a[ñn][aá]de)\b\s*/i,
    /^.*?\b(necesito|tengo\s+que|hay\s+que|me\s+falta[n]?)\s+comprar\s*/i,
    /^\s*(p[oó]nme|p[oó]n|pon|mete)\b\s*/i,
    /^.*?\bcomprar\b\s*/i,
  ];
  for (const re of prefijos) {
    const r = s.replace(re, '');
    if (r !== s) { s = r; break; }
  }
  // Sufijo "a/en (mi|la|el) lista/súper/carrito …".
  s = s.replace(/\b(a|en)\s+(mi\s+|la\s+|el\s+)?(lista(\s+de\s+(compras|s[uú]per))?|s[uú]per|carrito)\b.*$/i, '').trim();
  s = s.replace(/\bpor\s+favor\b/gi, '').replace(/[.?!¡¿]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  return s
    .split(/\s+y\s+|\s+e\s+|\s*,\s*/i)
    .map((x) => x.trim().replace(/^(el|la|los|las|un|una|unos|unas)\s+/i, '')) // quita artículo inicial
    .filter(Boolean)
    .map((x) => x.slice(0, 80))
    .slice(0, 10);
}
