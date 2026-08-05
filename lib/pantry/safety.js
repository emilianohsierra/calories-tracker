// Despensa · SEGURIDAD DE ALÉRGENOS del reco — SEGURO POR CONSTRUCCIÓN (cero fuga silenciosa).
// PROBLEMA (Slowking): filtrar por NOMBRE deja pasar marcas/nombres que SON el alérgeno sin la
// palabra clave. Keyword no cierra el vocabulario abierto de nombres.
//
// CONTRATO (CTO, db.readItemsParaMatching por ítem):
//   { allergens: string[], confianza: 'verified'|'user'|'ai' }
//   - VERIFICADO (confianza='verified', OFF/servicio): allergens = TOKENS OFF CRUDOS
//     (off.js normalizeAllergens: 'en:milk'→'milk', 'en:peanuts'→'peanuts', sulfitos→'sulphites').
//     canonGrupo mapea esos tokens crudos → grupo (mapa COMPLETO). Confiable.
//   - NO VERIFICADO (confianza 'user'|'ai', allergens=[]): keyword como primer filtro; si el
//     usuario tiene una alergia de grupo y NO se puede confirmar seguro → EXCLUIR (fail-safe).
// BELT (Slowking): el filtro keyword/léxico corre TAMBIÉN en ítems VERIFICADOS (unión
// conservadora) para que un hueco de tag no cuele un alérgeno de nombre evidente.
// Reusable por generar_cena (importa filtrarDespensaSegura).
import { findViolations } from '../coach/allergens';

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Grupos de alérgeno:
//   triggers = activan el grupo desde la RESTRICCIÓN del usuario (ES).
//   nombres  = marcas/nombres que SON el alérgeno (cierran fugas de keyword en NO verificados).
//   offTags  = TOKENS OFF CRUDOS que off.js entrega para ese grupo (mapa completo verificado).
const GRUPOS = {
  lacteo: {
    triggers: ['lacteo', 'lacteos', 'lactosa', 'leche', 'queso', 'derivado lacteo', 'dairy'],
    offTags: ['milk', 'lactose', 'cheese', 'cream', 'butter', 'yogurt', 'dairy', 'milk-proteins'],
    nombres: ['mozzarella', 'muzzarella', 'cheddar', 'manchego', 'parmesano', 'parmigiano', 'parmesan', 'gouda', 'philadelphia', 'brie', 'gruyere', 'gruyer', 'provolone', 'ricotta', 'ricota', 'feta', 'emmental', 'edam', 'camembert', 'mascarpone', 'burrata', 'cotija', 'oaxaca', 'panela', 'asadero', 'requeson', 'cottage', 'roquefort', 'gorgonzola', 'stilton', 'halloumi', 'pecorino', 'grana padano', 'nata', 'ghee'],
  },
  gluten: {
    triggers: ['gluten', 'trigo', 'celiaco', 'celiaquia', 'tacc', 'wheat'],
    offTags: ['gluten', 'wheat', 'barley', 'rye', 'oats', 'spelt', 'kamut'],
    nombres: ['pizza', 'baguette', 'baguet', 'croissant', 'crossaint', 'cereal', 'granola', 'pan', 'panque', 'bollo', 'bagel', 'pretzel', 'donut', 'dona', 'waffle', 'wafle', 'hotcake', 'pancake', 'galleta', 'muffin', 'brownie', 'pasta', 'espagueti', 'spaghetti', 'fideo', 'lasagna', 'ravioli', 'tortilla de harina', 'empanada', 'empanizado', 'capeado', 'couscous', 'cuscus', 'pan molido', 'pan rallado', 'pay', 'tarta', 'pastel'],
  },
  frutos_secos: {
    triggers: ['fruto seco', 'frutos secos', 'nuez', 'nueces', 'oleaginosa', 'tree nuts'],
    // Lista autoritativa del CTO (off.js) + variantes seguras. 1:1 con normalizeAllergens.
    offTags: ['nuts', 'tree-nuts', 'almonds', 'almond', 'hazelnuts', 'hazelnut', 'walnuts', 'walnut', 'cashew-nuts', 'cashews', 'cashew', 'pecan-nuts', 'pecans', 'pecan', 'pistachios', 'pistachio', 'macadamia-nuts', 'macadamia', 'queensland-nuts', 'brazil-nuts', 'brazil-nut'],
    nombres: ['nutella', 'mazapan', 'turron', 'praline', 'marzipan', 'nucita', 'pistache', 'avellana', 'almendra', 'macadamia', 'pecan', 'pecana', 'nuez de la india', 'crema de avellana', 'pasta de almendra'],
  },
  mani: {
    triggers: ['mani', 'cacahuate', 'cacahuete', 'peanut'],
    offTags: ['peanut', 'peanuts'],
    nombres: ['mazapan', 'mazapan de la rosa', 'crema de cacahuate', 'crema de mani', 'peanut butter', 'snickers', 'payaso'],
  },
  marisco: {
    triggers: ['marisco', 'mariscos', 'crustaceo', 'crustaceos', 'molusco', 'moluscos', 'shellfish'],
    offTags: ['crustaceans', 'crustacean', 'molluscs', 'mollusc', 'shellfish'],
    nombres: ['surimi', 'kanikama', 'kani', 'camaron', 'langosta', 'cangrejo', 'jaiba', 'pulpo', 'calamar', 'ostion', 'almeja', 'mejillon', 'callo', 'abulon', 'langostino'],
  },
  pescado: {
    triggers: ['pescado', 'pescados', 'pez', 'fish'],
    offTags: ['fish'],
    nombres: ['atun', 'salmon', 'tilapia', 'sardina', 'bacalao', 'anchoa', 'caviar', 'surimi'],
  },
  huevo: {
    triggers: ['huevo', 'huevos', 'egg'],
    offTags: ['eggs', 'egg'],
    nombres: ['mayonesa', 'merengue', 'frittata', 'omelette'],
  },
  soya: {
    triggers: ['soya', 'soja', 'soy'],
    offTags: ['soybeans', 'soybean', 'soy', 'soya'],
    nombres: ['tofu', 'edamame', 'tempeh', 'miso', 'salsa de soya', 'shoyu', 'tamari'],
  },
  ajonjoli: {
    triggers: ['ajonjoli', 'sesamo', 'sesame'],
    offTags: ['sesame', 'sesame-seeds', 'sesame-seed'],
    nombres: ['tahini', 'hummus', 'gomasio'],
  },
  // Backlog cerrado (Slowking): alérgenos que antes solo tenían keyword base sin grupo.
  mostaza: {
    triggers: ['mostaza', 'mustard'],
    offTags: ['mustard'],
    nombres: ['mostaza', 'mustard', 'dijon', 'mostaza dijon', 'honey mustard', 'mostaza antigua'],
  },
  apio: {
    triggers: ['apio', 'celery', 'celeriac', 'apio nabo'],
    offTags: ['celery', 'celeriac'],
    nombres: ['apio', 'celery', 'celeriac', 'apionabo', 'sal de apio', 'apio nabo'],
  },
  sulfitos: {
    triggers: ['sulfito', 'sulfitos', 'sulfite', 'sulphite', 'sulphites', 'metabisulfito', 'dioxido de azufre', 'so2'],
    offTags: ['sulphites', 'sulfites', 'sulphur-dioxide-and-sulphites', 'sulfur-dioxide-and-sulfites', 'sulphur-dioxide'],
    nombres: ['sulfito', 'metabisulfito', 'bisulfito', 'vino', 'vinagre', 'vinagre balsamico', 'orejones', 'fruta deshidratada'],
  },
  altramuz: {
    triggers: ['altramuz', 'altramuces', 'lupin', 'lupino', 'chocho'],
    offTags: ['lupin', 'lupine'],
    nombres: ['altramuz', 'altramuces', 'lupino', 'lupin', 'chocho', 'harina de lupino', 'harina de altramuz'],
  },
};

// Mapa EXACTO (normalizado) token OFF crudo → grupo. Se construye de GRUPOS[g].offTags. El match
// EXACTO evita el cruce peligroso: 'peanuts' NO cae en frutos_secos por contener 'nuts'.
const OFF_TO_GROUP = {};
for (const [g, def] of Object.entries(GRUPOS)) {
  for (const tag of def.offTags || []) OFF_TO_GROUP[norm(tag)] = g;
}

// Grupos donde 'advertir' es aceptable = intolerancia NO anafiláctica (lactosa). TODO lo demás
// —anafilácticos (maní, frutos secos, marisco, pescado, huevo, soya, ajonjolí, mostaza, apio,
// sulfitos, altramuz) y gluten— FUERZA excluir en DESCONOCIDO SIEMPRE, sin depender de opts.
const ADVERTIBLES = new Set(['lacteo']);
function todosAdvertibles(grupos) {
  if (!grupos.size) return false;
  for (const g of grupos) if (!ADVERTIBLES.has(g)) return false;
  return true;
}

function esVerificado(item) {
  return item?.confianza === 'verified';
}

// Normaliza un allergen del ítem → clave de grupo canónica. Acepta: (a) group-key ya canónica,
// (b) token OFF crudo ('milk','peanuts','sesame-seeds'…) vía OFF_TO_GROUP, (c) trigger ES,
// (d) plural/singular best-effort. Desconocido → se conserva (no casa con grupos → inofensivo).
export function canonGrupo(token) {
  const n = norm(token);
  if (!n) return n;
  if (GRUPOS[n]) return n; // ya es clave de grupo
  if (OFF_TO_GROUP[n]) return OFF_TO_GROUP[n]; // token OFF crudo (match EXACTO — 1:1 con la lista)
  for (const [g, def] of Object.entries(GRUPOS)) if (def.triggers.some((t) => norm(t) === n)) return g;
  const alt = n.endsWith('s') ? n.slice(0, -1) : `${n}s`; // singular/plural
  if (OFF_TO_GROUP[alt]) return OFF_TO_GROUP[alt];
  // FALLBACK includes (tokens FUERA de la lista autoritativa): dirección segura. maní ANTES que
  // frutos_secos para que un token con 'peanut' no caiga en frutos_secos por contener 'nuts'.
  const orden = ['mani', ...Object.keys(GRUPOS).filter((g) => g !== 'mani')];
  for (const g of orden) {
    for (const tag of GRUPOS[g].offTags || []) {
      const tn = norm(tag);
      if (tn.length >= 4 && (n.includes(tn) || tn.includes(n))) return g;
    }
  }
  return n; // desconocido → se conserva (no casa con ningún grupo → inofensivo)
}

// Grupos de alérgeno que activa la restricción del usuario.
export function gruposActivos(restricciones) {
  const set = new Set();
  for (const r of restricciones || []) {
    const n = norm(r);
    if (!n) continue;
    for (const [g, def] of Object.entries(GRUPOS)) {
      if (def.triggers.some((t) => { const tn = norm(t); return n === tn || n.includes(tn) || tn.includes(n); })) set.add(g);
    }
  }
  return set;
}

function terminos(item) {
  const base = Array.isArray(item.ingredientes) && item.ingredientes.length ? item.ingredientes.slice() : [];
  if (item.nombre) base.push(item.nombre);
  return base;
}
function textoItem(item) {
  return terminos(item).map(norm).join(' ');
}

// Golpe del LÉXICO EXTENDIDO (marcas/nombres) para algún grupo activo.
function golpeLexico(item, grupos) {
  const hay = textoItem(item);
  for (const g of grupos) {
    for (const nom of GRUPOS[g].nombres) {
      const nn = norm(nom);
      if (nn.length >= 3 && hay.includes(nn)) return g;
    }
  }
  return null;
}

// Clasifica un ítem: 'SEGURO' | 'INSEGURO' | 'DESCONOCIDO'. Determinista.
export function clasificarItem(item, restricciones) {
  const restr = (restricciones || []).filter(Boolean);
  if (!restr.length) return { status: 'SEGURO' };
  const grupos = gruposActivos(restr);

  // BELT (Slowking): keyword base + léxico extendido corren SIEMPRE (incl. verificados).
  const baseHit = findViolations(terminos(item), restr).length > 0;
  const lex = golpeLexico(item, grupos);

  // Etiquetas ESTRUCTURADAS (solo verificados): tokens OFF crudos → grupo (canonGrupo).
  let tag = null;
  if (esVerificado(item)) {
    const itemGr = new Set((Array.isArray(item.allergens) ? item.allergens : []).map(canonGrupo));
    for (const g of grupos) if (itemGr.has(g)) { tag = g; break; }
  }

  if (tag || baseHit || lex) {
    return { status: 'INSEGURO', motivo: tag ? `etiqueta:${tag}` : lex ? `posible ${lex}` : 'restriccion', grupo: tag || lex || null };
  }

  if (esVerificado(item)) return { status: 'SEGURO' }; // verificado, tags confiables y sin golpe de nombre
  if (grupos.size > 0) return { status: 'DESCONOCIDO' }; // nombre-solo + alergia de grupo → no verificable
  return { status: 'SEGURO' }; // solo restricciones no-grupo, sin golpe
}

// Filtra la despensa SEGURO POR CONSTRUCCIÓN. politicaNoVerificado:
//   'excluir' (DEFAULT, fail-safe) → DESCONOCIDO se EXCLUYE (no asumir seguro).
//   'advertir' → DESCONOCIDO se incluye con advertencia CLARA, PERO solo se honra para grupos
//     advertibles (lactosa); con cualquier grupo anafiláctico activo se FUERZA excluir.
export function filtrarDespensaSegura(items, restricciones, opts = {}) {
  const restr = (restricciones || []).filter(Boolean);
  const grupos = gruposActivos(restr);
  const advertir = opts.politicaNoVerificado === 'advertir' && todosAdvertibles(grupos);
  const seguros = [];
  const excluidos = [];
  for (const item of items || []) {
    const c = clasificarItem(item, restr);
    if (c.status === 'SEGURO') {
      seguros.push({ item, advertencia: null });
    } else if (c.status === 'INSEGURO') {
      excluidos.push({ item, motivo: c.motivo });
    } else if (!advertir) {
      excluidos.push({ item, motivo: 'no_verificado' }); // fail-safe (anafiláctico o sin opt)
    } else {
      seguros.push({
        item,
        advertencia: {
          tipo: 'no_verificado',
          texto: `No pudimos verificar que "${item.nombre || 'este producto'}" esté libre de tus alérgenos. Revisa el etiquetado antes de consumir.`,
        },
      });
    }
  }
  const hayAlergias = restr.length > 0;
  const disclaimer = hayAlergias
    ? 'Tienes alergias declaradas. Filtramos con la información disponible, pero revisa SIEMPRE el etiquetado del producto antes de consumir.'
    : null;
  return { seguros, excluidos, hayAlergias, disclaimer };
}
