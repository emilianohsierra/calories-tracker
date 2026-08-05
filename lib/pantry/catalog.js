// Contribución al catálogo por el USUARIO (D2): productos propios MARCADOS (is_user_created,
// NO verificado) + imágenes múltiples (product_images). Cliente de SESIÓN (RLS append; nivel
// 'usuario' permitido, 'verificado' NO). Update = APPEND: cada guardado inserta una fila nueva de
// product_nutrition; nunca sobrescribe procedencia/fecha. NADA de invención: campo ausente = null.
import * as brain from './product-brain.js';
import { norm } from './text.js';

// ---- Builders PUROS (testeables sin BD) ----
export function productoUsuarioRow({ nombre, marca = '', presentacion = null, unidad, imagen, brand_id = null, dedup_key = null, userId = null }) {
  return {
    name: nombre,
    norm: norm(`${nombre} ${marca}`),
    brand_id,
    default_unit: unidad ? String(unidad).slice(0, 20) : 'pieza',
    image_url: imagen ? String(imagen).slice(0, 300) : null,
    presentacion,
    dedup_key,
    origen: 'user',
    is_user_created: true,
    confidence_score: 0.3, // producto de usuario: confianza baja hasta que una fuente lo verifique
    created_by: userId,
  };
}

// Fila product_nutrition nivel 'usuario' desde la nutrición del cliente (tolera alias sodio/sodio_mg).
export function nutricionUsuarioRow(productId, nutricion = {}, userId, nowIso) {
  const n = nutricion || {};
  const esPorcion = n.base === 'por_porcion';
  return {
    product_id: productId,
    base_amount: esPorcion ? (n.porcion ?? n.porcion_g ?? 100) : 100,
    base_unit: esPorcion ? 'porcion' : 'g',
    calories: n.kcal ?? null,
    protein_g: n.prot ?? null,
    carbs_g: n.carb ?? null,
    fat_g: n.gras ?? null,
    fiber_g: n.fibra ?? null,
    azucar_g: n.azucar ?? null,
    sodium_mg: n.sodio ?? n.sodio_mg ?? null,
    saturated_fat_g: n.grasa_sat ?? null,
    allergens: [], // manual → sin tags estructurados (DESCONOCIDO, fail-safe del reco)
    nivel: 'usuario', // NUNCA 'verificado' (lo bloquea la RLS igual)
    source: 'user_manual',
    source_ref: null,
    source_updated_at: nowIso,
    created_by: userId,
  };
}

// ---- I/O ----
async function findOrInsertBrand(supabase, userId, marca) {
  if (!marca) return null;
  const bnorm = norm(marca);
  const { data: existing } = await supabase.from('brands').select('id').eq('norm', bnorm).maybeSingle();
  if (existing?.id) return existing.id;
  const { data: ins } = await supabase.from('brands').insert({ name: marca, norm: bnorm, created_by: userId }).select('id').single();
  return ins?.id || null;
}

export async function addProductImage(supabase, { product_id, image_url, source = 'user', image_type = 'front', is_primary = false, userId = null }) {
  if (!product_id || !image_url) return null;
  const { data } = await supabase.from('product_images')
    .insert({ product_id, image_url: String(image_url).slice(0, 300), source, image_type, is_primary, created_by: userId })
    .select('id').maybeSingle();
  return data?.id || null;
}

export async function readProductImages(supabase, product_id) {
  const { data } = await supabase.from('product_images')
    .select('image_url, source, image_type, is_primary')
    .eq('product_id', product_id)
    .order('is_primary', { ascending: false });
  return data || [];
}

// Crea (o reutiliza por dedup_key) un producto de catálogo MARCADO is_user_created + fila de
// nutrición 'usuario' (append) + imagen opcional. Devuelve product_id o null.
export async function crearProductoUsuario(supabase, userId, input = {}) {
  const nombre = String(input.nombre || '').trim().slice(0, 120);
  if (!nombre) return null;
  const marca = input.marca ? String(input.marca).slice(0, 80) : '';
  const presCanon = brain.normalizePresentacion(input.presentacion || '');
  const presentacion = presCanon?.canonica || null;
  const brand_id = await findOrInsertBrand(supabase, userId, marca);
  const dedup_key = brain.dedupKey({ nombre, marca, presentacion: input.presentacion });

  // Reusar si el dedup_key ya existe (no duplicar): solo agregamos nutrición 'usuario' + imagen.
  let productId = null;
  if (dedup_key) {
    const { data: ex } = await supabase.from('products').select('id').eq('dedup_key', dedup_key).maybeSingle();
    productId = ex?.id || null;
  }
  if (!productId) {
    const { data: prod, error } = await supabase
      .from('products')
      .insert(productoUsuarioRow({ nombre, marca, presentacion, unidad: input.unidad, imagen: input.imagen, brand_id, dedup_key, userId }))
      .select('id').single();
    if (error || !prod) {
      console.error('crearProductoUsuario:', error?.message);
      return null;
    }
    productId = prod.id;
  }

  await supabase.from('product_nutrition').insert(nutricionUsuarioRow(productId, input.nutricion, userId, new Date().toISOString()));

  if (input.imagen) {
    await addProductImage(supabase, { product_id: productId, image_url: input.imagen, source: 'user', image_type: 'front', is_primary: true, userId });
  }
  return productId;
}
