// Open Food Facts — semilla LAZY de datos 'verificado' (on-scan). NO dependencia dura:
// timeout corto + try/catch; si falla o no hay producto, el llamador cae a usuario/estimado.
// Atribución obligatoria: "Datos de Open Food Facts". Se cachea en el catálogo (una vez).
import { norm, httpUrl } from './text';
import { nutriScore, novaGroup } from './nutrition-normalize';
import { countryFromTags } from './country';
import { computeDataQuality } from './quality';

const OFF_URL = (code) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,image_url,categories,nutriments,allergens_tags,allergens,nutriscore_grade,nova_group,serving_quantity,serving_size,countries_tags,ingredients,ingredients_text,ingredients_text_es,additives_tags`;

// Unidad REAL de la porción desde el texto serving_size de OFF ('250 ml' → 'ml', '30 g' → 'g').
// H2: no forzar 'g' cuando OFF la da en ml (sub-marcaría CALORÍAS de líquidos con umbral de sólido).
function servingUnit(txt) {
  const s = String(txt || '').toLowerCase();
  if (s.includes('ml')) return 'ml';
  if (/\bl\b|litro|liter/.test(s)) return 'ml';
  if (/gramo|gram|\bg\b/.test(s)) return 'g';
  return null;
}

// Ingredientes (Fase 5): OFF v2 trae ingredients[] estructurado o ingredients_text. NADA de
// invención: sin dato → []. position = orden en la lista (1 = primero).
function extraerIngredientes(p) {
  const arr = Array.isArray(p.ingredients) ? p.ingredients : null;
  if (arr && arr.length) {
    return arr
      .map((it, i) => ({ ingredient: String(it?.text || it?.id || '').replace(/^[a-z]{2}:/, '').trim().slice(0, 120), position: i + 1 }))
      .filter((x) => x.ingredient)
      .slice(0, 80);
  }
  const txt = p.ingredients_text_es || p.ingredients_text || '';
  if (txt) {
    return String(txt)
      .split(/[,;]/)
      .map((s, i) => ({ ingredient: s.replace(/\([^)]*\)/g, '').trim().slice(0, 120), position: i + 1 }))
      .filter((x) => x.ingredient)
      .slice(0, 80);
  }
  return [];
}

// Aditivos (Fase 5): additives_tags → { additive_code:'E330', name:null }. SOLO código (sin riesgo;
// no hay fuente libre para rating → jamás semáforo). name null si la fuente no da uno legible.
function extraerAditivos(tags) {
  const list = Array.isArray(tags) ? tags : [];
  const out = [];
  const seen = new Set();
  for (const t of list) {
    const code = String(t || '').toLowerCase().replace(/^[a-z]{2}:/, '').trim();
    if (!/^e\d{3,4}[a-z]?$/.test(code)) continue;
    const up = code.toUpperCase();
    if (seen.has(up)) continue;
    seen.add(up);
    out.push({ additive_code: up, name: null });
  }
  return out;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : null; // negativos = inválido → null (Slowking H3)
}

// Alias de tokens OFF cuyo nombre canónico difiere del que espera canonGrupo de Karpathy.
// (Los demás tokens en:X → X ya casan directo: mustard/celery/lupin, milk/wheat/peanuts, etc.)
const OFF_TOKEN_ALIAS = {
  'sulphur-dioxide-and-sulphites': 'sulphites',
  'sulfur-dioxide-and-sulfites': 'sulphites',
  sulfites: 'sulphites',
};

// Normaliza allergens_tags/allergens de OFF → tokens OFF crudos (estilo 'en:milk' → 'milk').
// NO se mapean a nuestros grupos: el módulo de seguridad de Karpathy (lib/pantry/safety.js)
// hace ese mapeo con GRUPOS[g].offTags / canonGrupo (incluye mostaza/apio/sulfitos/altramuz).
// Campo acordado: allergens: string[]. Términos desconocidos se conservan (no inventa).
//
// ── CONTRATO CON KARPATHY (canonGrupo debe cubrir 1:1 estos strings) ──────────────────────
// normalizeAllergens produce, tras strip del prefijo 'en:'/'es:'/…, los tokens del taxonomy de
// allergens_tags de OFF. VOCABULARIO DEFINITIVO que puede emitir (por grupo destino):
//   lacteo:        milk
//   gluten:        gluten, wheat, barley, rye, oats, spelt, kamut
//   huevo:         eggs, egg
//   frutos_secos:  nuts, tree-nuts, almonds, hazelnuts, walnuts, cashew-nuts, cashew,
//                  pecan-nuts, pistachios, macadamia-nuts, queensland-nuts, brazil-nuts
//   mani:          peanuts
//   soya:          soybeans, soy
//   pescado:       fish
//   marisco:       crustaceans, molluscs, shellfish
//   ajonjoli:      sesame-seeds, sesame
//   mostaza:       mustard
//   apio:          celery, celeriac
//   sulfitos:      sulphites  (alias de 'sulphur-dioxide-and-sulphites' / 'sulfur-dioxide-and-sulfites' / 'sulfites')
//   altramuz:      lupin
// Cualquier token FUERA de esta lista pasa tal cual (Karpathy: canonGrupo por includes + belt
// de nombre/léxico en verificados). NO se cambia la representación (tokens crudos, no group-keys).
export function normalizeAllergens(tags) {
  const out = new Set();
  const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  for (const raw of list) {
    let key = String(raw || '').toLowerCase().trim().split(':').pop().trim(); // 'en:milk' → 'milk'
    if (!key) continue;
    key = OFF_TOKEN_ALIAS[key] || key;
    out.add(key);
  }
  return [...out];
}

// Mapea un `product` crudo de OFF → shape del catálogo (sin code). null si no tiene nombre.
// NADA de invención: campo ausente = null. Compartido por fetchOFF (barcode) y searchOFFByName.
function mapOFF(p) {
  const nm = p?.product_name && String(p.product_name).trim();
  if (!nm) return null;
  const nut = p.nutriments || {};
  const kcal = n(nut['energy-kcal_100g']) ?? (n(nut.energy_100g) != null ? Math.round(n(nut.energy_100g) / 4.184) : null);
  return {
    nombre: String(nm).slice(0, 120),
    marca: p.brands ? String(p.brands).split(',')[0].trim().slice(0, 80) : '',
    categoria: p.categories ? String(p.categories).split(',').pop().trim().slice(0, 40) : '',
    image_url: httpUrl(p.image_url), // solo http/https (se persiste vía cacheOFF)
    // Etiquetas de alérgeno ESTRUCTURADAS (verificado): cierra los nombres de producto.
    allergens: normalizeAllergens(p.allergens_tags || p.allergens || []),
    nutri_score: nutriScore(p.nutriscore_grade), // a..e o null (dato real de OFF)
    nova_group: novaGroup(p.nova_group),          // 1..4 o null
    country: countryFromTags(p.countries_tags),   // país REAL (countries_tags), null si no hay
    serving_size: n(p.serving_quantity),          // cantidad por porción (si OFF lo trae)
    serving_unit: servingUnit(p.serving_size) ?? (n(p.serving_quantity) != null ? 'g' : null), // ml real si OFF lo da
    ingredientes: extraerIngredientes(p),         // [] si no hay (regla de oro)
    aditivos: extraerAditivos(p.additives_tags),  // [{additive_code,name:null}] sin riesgo
    nutricion: {
      base: 'por_100g',
      kcal,
      prot: n(nut.proteins_100g),
      carb: n(nut.carbohydrates_100g),
      gras: n(nut.fat_100g),
      fibra: n(nut.fiber_100g),
      azucar: n(nut.sugars_100g),
      sodio_mg: n(nut.sodium_100g) != null ? Math.round(n(nut.sodium_100g) * 1000) : null,
      grasa_sat: n(nut['saturated-fat_100g']),
      grasa_trans: n(nut['trans-fat_100g']),
      procedencia: 'verificado',
    },
  };
}

// Consulta OFF por código de barras → shape del catálogo o null. Nunca lanza.
export async function fetchOFF(code) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(OFF_URL(code), { signal: ctrl.signal, headers: { 'User-Agent': 'CaloriesTracker/1.0 (despensa)' } });
    if (!res.ok) return null;
    const j = await res.json();
    if (j?.status !== 1 || !j?.product) return null;
    return mapOFF(j.product);
  } catch {
    return null; // OFF no disponible / timeout → el llamador degrada a usuario/estimado
  } finally {
    clearTimeout(t);
  }
}

// Mapea un `hit` de Search-a-licious (search.openfoodfacts.org) → shape del catálogo. Su forma
// difiere del producto v2: brands es ARRAY, categories_tags array, image_url directo. null si no
// hay nombre. NADA de invención: campo ausente = null.
function mapSaLHit(h) {
  const nm = h?.product_name && String(h.product_name).trim();
  if (!nm) return null;
  const brands = Array.isArray(h.brands) ? h.brands : h.brands ? String(h.brands).split(',') : [];
  const cats = Array.isArray(h.categories_tags) ? h.categories_tags : [];
  const nut = h.nutriments || {};
  const kcal = n(nut['energy-kcal_100g']) ?? (n(nut.energy_100g) != null ? Math.round(n(nut.energy_100g) / 4.184) : null);
  return {
    nombre: String(nm).slice(0, 120),
    marca: brands[0] ? String(brands[0]).trim().slice(0, 80) : '',
    categoria: cats.length ? String(cats[cats.length - 1]).replace(/^[a-z]{2}:/, '').slice(0, 40) : '',
    image_url: httpUrl(h.image_url || h.image_front_url),
    allergens: normalizeAllergens(h.allergens_tags || []),
    nutri_score: nutriScore(h.nutriscore_grade),
    nova_group: novaGroup(h.nova_group),
    country: countryFromTags(h.countries_tags),
    serving_size: n(h.serving_quantity),
    serving_unit: servingUnit(h.serving_size) ?? (n(h.serving_quantity) != null ? 'g' : null),
    ingredientes: extraerIngredientes(h),
    aditivos: extraerAditivos(h.additives_tags),
    nutricion: {
      base: 'por_100g',
      kcal,
      prot: n(nut.proteins_100g),
      carb: n(nut.carbohydrates_100g),
      gras: n(nut.fat_100g),
      fibra: n(nut.fiber_100g),
      azucar: n(nut.sugars_100g),
      sodio_mg: n(nut.sodium_100g) != null ? Math.round(n(nut.sodium_100g) * 1000) : null,
      grasa_sat: n(nut['saturated-fat_100g']),
      grasa_trans: n(nut['trans-fat_100g']),
      procedencia: 'verificado',
    },
  };
}

// Búsqueda OFF por NOMBRE → array de productos con `code`. Usa Search-a-licious
// (search.openfoodfacts.org), el endpoint MODERNO y fiable: el legacy cgi/search.pl y api/v2/search
// devuelven 503 para uso server-side. Nunca lanza. Sólo devuelve los que traen barcode (identidad
// para cacheOFF + dedup). Datos REALES de OFF (verificado); no se inventa nada.
export async function searchOFFByName(nombre, { limit = 8 } = {}) {
  const q = String(nombre || '').trim();
  if (q.length < 2) return [];
  const fields = 'code,product_name,brands,image_url,image_front_url,nutriments,categories_tags,allergens_tags,nutriscore_grade,nova_group,serving_quantity,serving_size,countries_tags,ingredients_text,ingredients_text_es,additives_tags';
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=${Math.min(limit, 20)}&fields=${fields}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'CaloriesTracker/1.0 (despensa)' } });
    if (!res.ok) return [];
    const j = await res.json();
    const list = Array.isArray(j?.hits) ? j.hits : [];
    const out = [];
    for (const h of list) {
      const code = String(h?.code || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 32);
      const m = mapSaLHit(h);
      if (m && code) out.push({ ...m, code });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

// Cachea un producto OFF en el catálogo (products + product_nutrition[verificado] + barcode +
// product_sources). Idempotente-suave: si el barcode ya existe, no duplica. Devuelve product_id.
// SEGURIDAD (Slowking): DEBE recibir el cliente ADMIN (service_role, server-only) tras un fetch
// REAL a OFF en la route. 'verificado' NO es escribible por usuarios (policy) ni por RPC.
export async function cacheOFF(supabase, userId, code, off) {
  // Si el barcode ya está, reusar.
  const { data: existing } = await supabase.from('barcodes').select('product_id').eq('code', code).maybeSingle();
  if (existing?.product_id) return existing.product_id;

  const pais = off.country || null; // país REAL de OFF (countries_tags); NO el GS1 (ese es solo ranking)
  let brand_id = null;
  if (off.marca) {
    const bnorm = norm(off.marca);
    const { data: b } = await supabase.from('brands').upsert({ name: off.marca, norm: bnorm, country: pais, created_by: userId }, { onConflict: 'norm' }).select('id').single();
    brand_id = b?.id || null;
  }
  // Calidad del dato (Fase 4): completitud + fuente. Se computa con dato REAL (nada inventado).
  const dq = computeDataQuality({ codigo: code, image_url: off.image_url, marca: off.marca, nutricion: off.nutricion, confianza: 'verified' });
  const { data: prod, error: pErr } = await supabase
    .from('products')
    .insert({
      name: off.nombre, norm: norm(`${off.nombre} ${off.marca}`), brand_id, default_unit: 'g',
      image_url: off.image_url || null, off_id: code, origen: 'open_food_facts', created_by: userId,
      country: pais, nutri_score: off.nutri_score ?? null, nova_group: off.nova_group ?? null,
      data_quality: dq.level, data_quality_score: dq.score,
    })
    .select('id')
    .single();
  if (pErr || !prod) return null;

  // Nutrición VERIFICADA: insert directo con el cliente ADMIN (service_role bypassa RLS). El
  // 'verificado' SOLO se escribe aquí, en el server, tras un fetch real a OFF (no vía RPC/usuario).
  const nu = off.nutricion || {};
  await supabase.from('product_nutrition').insert({
    product_id: prod.id, base_amount: 100, base_unit: 'g',
    calories: nu.kcal ?? null, protein_g: nu.prot ?? null, carbs_g: nu.carb ?? null, fat_g: nu.gras ?? null,
    fiber_g: nu.fibra ?? null, azucar_g: nu.azucar ?? null, sodium_mg: nu.sodio_mg ?? null, saturated_fat_g: nu.grasa_sat ?? null,
    trans_fat_g: nu.grasa_trans ?? null, serving_size: off.serving_size ?? null, serving_unit: off.serving_unit ?? null,
    allergens: Array.isArray(off.allergens) ? off.allergens : [],
    nivel: 'verificado', source: 'open_food_facts', source_ref: code, created_by: userId,
  });
  await supabase.from('barcodes').insert({ product_id: prod.id, code, tipo: 'ean13', source: 'open_food_facts' });
  await supabase.from('product_sources').insert({ product_id: prod.id, source_type: 'open_food_facts', external_id: code, url: `https://world.openfoodfacts.org/product/${code}` });

  // Fase 5: ingredientes + aditivos (SOLO OFF; faltante = no fila). Best-effort: si falla, el
  // producto/nutrición ya quedaron (no bloquea). SIN nivel de riesgo en aditivos.
  const ingr = Array.isArray(off.ingredientes) ? off.ingredientes : [];
  if (ingr.length) {
    await supabase.from('product_ingredients').insert(
      ingr.map((it) => ({ product_id: prod.id, ingredient: it.ingredient, position: it.position ?? null, source: 'open_food_facts', created_by: userId }))
    );
  }
  const adit = Array.isArray(off.aditivos) ? off.aditivos : [];
  if (adit.length) {
    await supabase.from('product_additives').insert(
      adit.map((a) => ({ product_id: prod.id, additive_code: a.additive_code, name: a.name ?? null, source: 'open_food_facts', created_by: userId }))
    );
  }
  return prod.id;
}
