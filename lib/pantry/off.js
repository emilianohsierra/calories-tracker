// Open Food Facts — semilla LAZY de datos 'verificado' (on-scan). NO dependencia dura:
// timeout corto + try/catch; si falla o no hay producto, el llamador cae a usuario/estimado.
// Atribución obligatoria: "Datos de Open Food Facts". Se cachea en el catálogo (una vez).
import { norm, httpUrl } from './text';

const OFF_URL = (code) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,image_url,categories,nutriments,allergens_tags,allergens`;

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
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

// Búsqueda OFF por NOMBRE → array de productos con `code` (para cachear/dedupe). Nunca lanza.
// Sólo devuelve los que traen barcode (identidad para cacheOFF + dedup por barcode). Datos REALES
// de OFF (verificado); no se inventa nada. Se usa para enriquecer la búsqueda por nombre del usuario.
export async function searchOFFByName(nombre, { limit = 6 } = {}) {
  const q = String(nombre || '').trim();
  if (q.length < 2) return [];
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${Math.min(limit, 20)}&fields=code,product_name,brands,image_url,categories,nutriments,allergens_tags`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'CaloriesTracker/1.0 (despensa)' } });
    if (!res.ok) return [];
    const j = await res.json();
    const list = Array.isArray(j?.products) ? j.products : [];
    const out = [];
    for (const p of list) {
      const code = String(p?.code || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 32);
      const m = mapOFF(p);
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

  let brand_id = null;
  if (off.marca) {
    const bnorm = norm(off.marca);
    const { data: b } = await supabase.from('brands').upsert({ name: off.marca, norm: bnorm, created_by: userId }, { onConflict: 'norm' }).select('id').single();
    brand_id = b?.id || null;
  }
  const { data: prod, error: pErr } = await supabase
    .from('products')
    .insert({ name: off.nombre, norm: norm(`${off.nombre} ${off.marca}`), brand_id, default_unit: 'g', image_url: off.image_url || null, off_id: code, origen: 'open_food_facts', created_by: userId })
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
    allergens: Array.isArray(off.allergens) ? off.allergens : [],
    nivel: 'verificado', source: 'open_food_facts', source_ref: code, created_by: userId,
  });
  await supabase.from('barcodes').insert({ product_id: prod.id, code, tipo: 'ean13', source: 'open_food_facts' });
  await supabase.from('product_sources').insert({ product_id: prod.id, source_type: 'open_food_facts', external_id: code, url: `https://world.openfoodfacts.org/product/${code}` });
  return prod.id;
}
