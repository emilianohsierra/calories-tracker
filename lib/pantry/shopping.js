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

export { ORIGENES };
