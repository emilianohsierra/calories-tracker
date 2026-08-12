import { personaBlock, contextoDiaBlock } from './persona';
import { readPantryNombres, readItemsParaMatching } from '../pantry/db';

const HISTORY_LIMIT = 14; // turnos verbatim MÁS RECIENTES (L3); lo viejo → resumen progresivo (coach_summaries)

// Fecha local (America/Mexico_City) 'YYYY-MM-DD' y hora 'HH:MM'.
export function localDateTime() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t)?.value || '';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

// Ensambla las capas L1 (system cacheado), L2 (contexto_dia volátil) y L3 (historial).
// Reusa nutrition_profiles/targets (Ola 1) y meals — sin duplicar.
export async function assembleContext(supabase, userId, conversationId) {
  const { date, time } = localDateTime();

  const [{ data: profile }, { data: targets }, { data: meals }, { data: history }, { data: summary }, { data: dayState }, { data: memorias }, despensa, despensaItems] =
    await Promise.all([
      supabase.from('nutrition_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('nutrition_targets').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('meals').select('calories, protein_g, carbs_g, fat_g').eq('user_id', userId).eq('date', date),
      // GAP 1 fix: seguir la COLA del hilo. Antes usaba ascending+limit SIN offset → tomaba los
      // PRIMEROS 12 mensajes y el coach se congelaba en el arranque. Ahora trae los N MÁS RECIENTES
      // (descending+limit) y se re-invierte a orden cronológico abajo. Lo que sale de esta ventana
      // vive comprimido en coach_summaries (resumen progresivo).
      supabase
        .from('coach_messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT),
      supabase.from('coach_summaries').select('summary').eq('conversation_id', conversationId).maybeSingle(),
      // Estado del día (agua/entreno/sueño/estrés/hora). Si la tabla aún no existe (SQL
      // pendiente), esto devuelve error+data:null y NO rompe el contexto.
      supabase.from('coach_day_state').select('*').eq('user_id', userId).eq('date', date).maybeSingle(),
      // Memoria (L4-simple): hechos activos y no caducados. Límite 12 = cota de tokens.
      // Deploy-safe: si la tabla no existe aún, devuelve error+data:null (no rompe).
      supabase
        .from('coach_memories')
        .select('tipo, contenido')
        .eq('user_id', userId)
        .eq('activa', true)
        .or(`caduca_en.is.null,caduca_en.gte.${date}`)
        .order('updated_at', { ascending: false })
        .limit(12),
      // Despensa (V1): ítems del usuario para que el coach recomiende con lo que tiene.
      // Deploy-safe: si las tablas de despensa no existen aún, devuelve [].
      readPantryNombres(supabase, userId, 40),
      // Fase 6: ítems con NUTRICIÓN REAL + calidad (nutri_score/nova/sellos) para recomendar con
      // números reales del Product-DB (generar_cena determinista). Deploy-safe → [].
      readItemsParaMatching(supabase, userId, 60),
    ]);

  const consumed = (meals || []).reduce(
    (a, m) => ({
      kcal: a.kcal + (m.calories || 0),
      prot: a.prot + (m.protein_g || 0),
      carb: a.carb + (m.carbs_g || 0),
      fat: a.fat + (m.fat_g || 0),
    }),
    { kcal: 0, prot: 0, carb: 0, fat: 0 }
  );
  const pend = targets
    ? {
        kcal: Math.round(targets.kcal_target - consumed.kcal),
        prot: Math.round(targets.protein_g - consumed.prot),
        carb: Math.round(targets.carbs_g - consumed.carb),
        fat: Math.round(targets.fat_g - consumed.fat),
      }
    : {};

  const ctx = {
    profile,
    targets,
    today: {
      date, // fecha local (para filtrar caducados en la recomendación)
      hora_local: time,
      n_comidas: (meals || []).length,
      kcal: Math.round(consumed.kcal),
      prot: Math.round(consumed.prot),
      carb: Math.round(consumed.carb),
      fat: Math.round(consumed.fat),
      pendientes: pend,
      estado: dayState || null, // agua_ml/entreno_estado/sueno_h/estres/hora_comida
    },
    memorias: memorias || [], // hechos curados (L4-simple) para <contexto_dia>
    despensa: despensa || [], // ítems de la despensa (V1) para recomendar con lo que tiene
    despensaItems: despensaItems || [], // Fase 6: ítems con nutrición real + calidad (recomendación)
    resumen: summary?.summary || '',
  };

  return {
    // Temporal: system como STRING plano (igual que analyze, que sí funciona). El prompt
    // caching (array + cache_control) se re-activa después de confirmar el chat.
    system: personaBlock(ctx),
    contextoDia: contextoDiaBlock(ctx),
    // Se trajeron descending (los más recientes); re-invertir a orden cronológico para el modelo.
    history: (history || []).slice().reverse().map((m) => ({ role: m.role, content: m.content })),
    ctx,
  };
}
