// Capa de datos SERVER de la LISTA DE COMPRAS (Fase 7). Reusa shopping_lists (header) +
// shopping_list_items (líneas) de supabase/despensa.sql. RLS propia por usuario. Deploy-safe:
// si las tablas aún no existen (SQL pendiente), las consultas devuelven data:null y estos
// helpers regresan vacío/null sin romper. CRUD siempre Free (la lista no es un tier).

const ORIGENES = ['coach', 'manual', 'receta', 'despensa'];

// Fila shopping_list_items (BD) → shape del cliente.
export function toClientListItem(row) {
  return {
    id: row.id,
    product_id: row.product_id || null,
    texto: row.texto_libre || '',
    cantidad: row.cantidad != null ? Number(row.cantidad) : null,
    unidad: row.unidad || null,
    comprado: !!row.marcado,
    origen: ORIGENES.includes(row.origen) ? row.origen : 'manual',
  };
}

// Lista por defecto (1 por usuario en V1). create=true la crea si falta. Deploy-safe.
export async function getDefaultList(supabase, userId, { create = false } = {}) {
  let { data: lista } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!lista && create) {
    const { data: created } = await supabase
      .from('shopping_lists')
      .insert({ user_id: userId })
      .select('id')
      .single();
    lista = created || null;
  }
  return lista || null;
}

// Ítems de la lista del usuario (shape del cliente). Deploy-safe → [].
export async function readListItems(supabase, userId, limit = 200) {
  const lista = await getDefaultList(supabase, userId);
  if (!lista) return [];
  const { data } = await supabase
    .from('shopping_list_items')
    .select('id, product_id, texto_libre, cantidad, unidad, marcado, origen')
    .eq('list_id', lista.id)
    .eq('user_id', userId) // defensa en profundidad además de RLS
    .order('created_at', { ascending: true })
    .limit(limit);
  return (data || []).map(toClientListItem);
}

// Escribe varios ítems en la lista del usuario (usado por el coach al "anota X"). Crea la lista si
// falta. Scoped por user (user_id + RLS). Devuelve los ítems escritos (shape del cliente). Deploy-safe.
export async function escribirLista(supabase, userId, items) {
  const lista = Array.isArray(items) ? items.filter((it) => it && (it.texto || it.product_id)) : [];
  if (!lista.length) return [];
  const list = await getDefaultList(supabase, userId, { create: true });
  if (!list) return [];
  const rows = lista.slice(0, 50).map((it) => ({
    list_id: list.id,
    user_id: userId,
    product_id: it.product_id ? String(it.product_id) : null,
    texto_libre: it.texto ? String(it.texto).slice(0, 120) : null,
    cantidad: it.cantidad != null && Number.isFinite(Number(it.cantidad)) ? Number(it.cantidad) : null,
    unidad: it.unidad ? String(it.unidad).slice(0, 20) : null,
    marcado: false,
    origen: ORIGENES.includes(it.origen) ? it.origen : 'coach',
  }));
  const { data, error } = await supabase.from('shopping_list_items').insert(rows).select('*');
  if (error) {
    console.error('escribirLista:', error.message);
    return [];
  }
  return (data || []).map(toClientListItem);
}

export { ORIGENES };
