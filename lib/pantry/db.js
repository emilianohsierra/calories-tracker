// Capa de datos SERVER-side de la despensa (endpoints /api/pantry/* + contexto del coach).
// Distinta del `store.js` CLIENT del equipo (ese hace fallback a localStorage). Deploy-safe:
// si las tablas aún no existen (SQL pendiente de correr), las consultas devuelven data:null y
// estos helpers regresan vacío/null sin romper.
// Contrato de item (Rams store.js + Karpathy quePuedoComer):
//   { id, nombre, marca, categoria, cantidad, unidad, caduca_el,
//     nutricion:{ base, porcion_g?, kcal, prot, carb, gras, fibra?, procedencia }, confianza, imagen }

import { sellosNOM051, inferirForma, esJugo } from './nom051';

const CONFIANZA = ['verified', 'user', 'ai'];
// Reusa el bucket de fotos de platillos (sin SQL nuevo). `imagen` guardado puede ser:
//   · un PATH de storage `{uid}/pantry/{uuid}.ext` (foto de etiqueta subida) → hay que FIRMARLO, o
//   · una URL http externa (foto de producto de Open Food Facts) → se muestra tal cual.
const BUCKET = 'meal-photos';
const esUrlHttp = (s) => typeof s === 'string' && /^https?:\/\//i.test(s);

// image_url MOSTRABLE a partir de `imagen`: path de storage → URL firmada; URL http → tal cual.
// Deploy-safe: si el bucket/objeto no existe o falla la firma, devuelve '' (nunca lanza).
export async function firmarImagen(supabase, imagen) {
  if (!imagen) return '';
  if (esUrlHttp(imagen)) return imagen;
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(imagen, 3600);
    return data?.signedUrl || '';
  } catch {
    return '';
  }
}

// Fila pantry_items (BD) → shape del cliente. `image_url` mostrable: para URLs http (OFF) es
// inmediato; para paths de storage lo rellena readItems (firma en lote) o el llamador (firmarImagen).
export function toClientItem(row) {
  const imagen = row.imagen || '';
  return {
    id: row.id,
    nombre: row.nombre,
    marca: row.marca || '',
    categoria: row.categoria || '',
    cantidad: Number(row.cantidad),
    unidad: row.unidad || 'pieza',
    caduca_el: row.caduca_el || null,
    nutricion: row.nutricion || null,
    allergens: Array.isArray(row.allergens) ? row.allergens : [],
    confianza: CONFIANZA.includes(row.confianza) ? row.confianza : 'user',
    imagen,
    image_url: esUrlHttp(imagen) ? imagen : '',
  };
}

// Despensa por defecto (1 por usuario en V1). create=true la crea si falta.
export async function getDefaultPantry(supabase, userId, { create = false } = {}) {
  let { data: pantry } = await supabase
    .from('pantries')
    .select('id')
    .eq('user_id', userId)
    .eq('es_default', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!pantry && create) {
    const { data: created } = await supabase
      .from('pantries')
      .insert({ user_id: userId, es_default: true })
      .select('id')
      .single();
    pantry = created || null;
  }
  return pantry || null;
}

// Ítems del usuario en shape del cliente (para GET /api/pantry).
export async function readItems(supabase, userId, limit = 200) {
  const pantry = await getDefaultPantry(supabase, userId);
  if (!pantry) return [];
  const { data } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('pantry_id', pantry.id)
    .order('updated_at', { ascending: false })
    .limit(limit);
  const rows = data || [];
  const items = rows.map(toClientItem);
  // Firma en LOTE los paths de storage (fotos de etiqueta). Las URLs http (OFF) ya vienen
  // resueltas por toClientItem. Deploy-safe: si falla la firma, image_url queda ''.
  const paths = [...new Set(rows.map((r) => r.imagen).filter((im) => im && !esUrlHttp(im)))];
  if (paths.length) {
    try {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      const byPath = {};
      for (const s of signed || []) if (s?.path && s?.signedUrl) byPath[s.path] = s.signedUrl;
      for (const it of items) if (!it.image_url && it.imagen) it.image_url = byPath[it.imagen] || '';
    } catch (e) {
      console.error('firmar imágenes despensa:', e?.message);
    }
  }
  return items;
}

// allergens SOLO se expone en ítems VERIFICADOS (OFF): en un manual, un [] no debe leerse
// como "verificado sin alérgenos". Sin el campo → Karpathy lo trata como DESCONOCIDO.
function conAllergens(base, r) {
  if (r.confianza === 'verified') base.allergens = Array.isArray(r.allergens) ? r.allergens : [];
  base.confianza = r.confianza || 'user';
  return base;
}

// Lista compacta para el contexto del coach + filtro de seguridad de generar_cena. Deploy-safe.
export async function readPantryNombres(supabase, userId, limit = 40) {
  const pantry = await getDefaultPantry(supabase, userId);
  if (!pantry) return [];
  const { data } = await supabase
    .from('pantry_items')
    .select('nombre, cantidad, unidad, caduca_el, allergens, confianza')
    .eq('pantry_id', pantry.id)
    .order('updated_at', { ascending: false })
    .limit(limit);
  return (data || []).map((r) => conAllergens({ nombre: r.nombre, cantidad: Number(r.cantidad), unidad: r.unidad, caduca_el: r.caduca_el || null }, r));
}

// Calidad (CONTEXTO, Fase 6) desde el producto vinculado: nutri_score/nova + sellos NOM-051
// computados de la nutrición POR-100g del catálogo (no de la snapshot del ítem). PURA, testeable.
// Sin producto/dato → null (nada inventado). Los sellos usan el gate de añadidos por ingredientes.
export function calidadDeProducto(prod, unidad) {
  if (!prod) return { nutri_score: null, nova_group: null, sellos: null };
  const rows = Array.isArray(prod.product_nutrition) ? prod.product_nutrition : [];
  const best = rows.find((x) => x.nivel === 'verificado') || rows[0] || null;
  let sellos = null;
  if (best) {
    const nut100 = { kcal: best.calories, prot: best.protein_g, carb: best.carbs_g, gras: best.fat_g, azucar: best.azucar_g, grasa_sat: best.saturated_fat_g, grasa_trans: best.trans_fat_g, sodio_mg: best.sodium_mg };
    const ingr = (Array.isArray(prod.product_ingredients) ? prod.product_ingredients : []).map((i) => i.ingredient).filter(Boolean);
    const señales = { serving_unit: best.serving_unit, unidad, categoria: prod.categories?.name };
    sellos = sellosNOM051(nut100, { forma: inferirForma(señales), esJugo: esJugo(señales), ingredientes: ingr });
  }
  return { nutri_score: prod.nutri_score || null, nova_group: prod.nova_group ?? null, sellos };
}

// Ítems en el shape que espera quePuedoComer (Karpathy): pantry_item_id + caduca_en + nutricion.
// Fase 6: además adjunta CONTEXTO de calidad (nutri_score/nova/sellos) del producto vinculado, para
// que el coach recomiende con datos reales + info de etiqueta. Deploy-safe: sin product_id → nulls.
export async function readItemsParaMatching(supabase, userId, limit = 200) {
  const pantry = await getDefaultPantry(supabase, userId);
  if (!pantry) return [];
  const { data } = await supabase
    .from('pantry_items')
    .select('id, nombre, cantidad, unidad, caduca_el, nutricion, allergens, confianza, product_id, products(nutri_score, nova_group, categories(name), product_nutrition(base_unit, calories, protein_g, carbs_g, fat_g, fiber_g, azucar_g, sodium_mg, saturated_fat_g, trans_fat_g, serving_unit, nivel), product_ingredients(ingredient))')
    .eq('pantry_id', pantry.id)
    .limit(limit);
  // allergens SOLO en verificados (ver conAllergens): así Karpathy filtra por tag estructurado
  // en verificados y es conservador (DESCONOCIDO) en no-verificados. NO se inventan tags.
  return (data || []).map((r) => {
    const cal = calidadDeProducto(r.products, r.unidad);
    // INGREDIENTES reales del producto vinculado → el cinturón léxico de safety.js (terminos()) los
    // lee y cierra la ventana OFF-tag-gap (alérgeno OCULTO sin tag ni en el nombre). Slowking H1.
    const ingredientes = (r.products?.product_ingredients || []).map((i) => i.ingredient).filter(Boolean);
    return conAllergens(
      { pantry_item_id: r.id, nombre: r.nombre, cantidad: Number(r.cantidad), unidad: r.unidad || 'pieza', caduca_en: r.caduca_el || null, nutricion: r.nutricion || null, ingredientes, nutri_score: cal.nutri_score, nova_group: cal.nova_group, sellos: cal.sellos },
      r
    );
  });
}

// ── Sustituciones en la FICHA del producto (Fase 7, #3) ─────────────────────────────────────────────
// Select del catálogo con lo necesario para calidad (nutri_score/nova/sellos) + ingredientes (cinturón
// léxico de alérgenos de safety.js). Mismo shape que readItemsParaMatching usa para product-linked.
const PRODUCTO_CALIDAD_SELECT = 'id, name, default_unit, nutri_score, nova_group, categories(name), product_nutrition(base_unit, calories, protein_g, carbs_g, fat_g, fiber_g, azucar_g, sodium_mg, saturated_fat_g, trans_fat_g, serving_unit, nivel), product_ingredients(ingredient)';

// Da forma de CANDIDATO/target a una fila de products (sellos vía calidadDeProducto, ingredientes para
// el cinturón). `disponible` lo fija el caller (true = está en la despensa del usuario).
function shapeProductoCatalogo(prod, disponible = false) {
  if (!prod || !prod.name) return null;
  const cal = calidadDeProducto(prod, prod.default_unit);
  const ingredientes = (prod.product_ingredients || []).map((i) => i.ingredient).filter(Boolean);
  return { product_id: prod.id, nombre: prod.name, nutri_score: cal.nutri_score, nova_group: cal.nova_group, sellos: cal.sellos, ingredientes, disponible };
}

// Producto único del catálogo con calidad (para resolver el TARGET cuando NO está en la despensa). null
// si no existe. Deploy-safe: sin tablas → null (la ficha degrada).
export async function getProductoCalidad(supabase, productId) {
  if (!productId) return null;
  const { data, error } = await supabase.from('products').select(PRODUCTO_CALIDAD_SELECT).eq('id', productId).maybeSingle();
  if (error || !data) return null;
  return shapeProductoCatalogo(data, false);
}

// Alternativas CURADAS del catálogo (product_alternatives) para un producto → candidatos shape-item.
// Best-effort: tabla vacía/ausente/feature-off → [] (deploy-safe). NO inventa: solo lee relaciones reales;
// la seguridad (alérgenos) y "mejor" las decide sustituir() sobre estos candidatos.
export async function readAlternativasCatalogo(supabase, productId, limit = 20) {
  if (!productId) return [];
  const { data: rels, error } = await supabase.from('product_alternatives').select('alternative_id').eq('product_id', productId).limit(limit);
  if (error || !rels?.length) return [];
  const ids = [...new Set(rels.map((r) => r.alternative_id).filter(Boolean))];
  if (!ids.length) return [];
  const { data: prods, error: e2 } = await supabase.from('products').select(PRODUCTO_CALIDAD_SELECT).in('id', ids);
  if (e2) return [];
  return (prods || []).map((p) => shapeProductoCatalogo(p, false)).filter(Boolean);
}
