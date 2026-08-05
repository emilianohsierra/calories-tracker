import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readItemsParaMatching } from '@/lib/pantry/db';
import { quePuedoComer } from '@/lib/pantry/suggest';
import { localDateTime } from '@/lib/coach/context';
import { limitPayload } from '@/lib/paywall';
import { nextResetLabel } from '@/lib/usage';

export const runtime = 'nodejs';
export const maxDuration = 30;

// rpc(...) es un thenable de PostgREST, no una Promise nativa: sin .catch(). Envolver.
async function safeRpc(supabase, fn, args) {
  try {
    return await supabase.rpc(fn, args);
  } catch (e) {
    console.error('rpc fallo:', fn, e?.message);
    return { data: null, error: e };
  }
}

// POST /api/coach/que-puedo-comer → { opciones } (<=3, deterministas de la despensa) o 429 limit.
// Reserva atómica del cap despensa_reco ANTES del trabajo (patrón consumir_analisis); si no hay
// opciones (despensa vacía), reembolsa. Pro ilimitado. NO llama al modelo (quePuedoComer es puro).
export async function POST() {
  let supabase = null;
  let requestId = null;
  try {
    supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

    // Reserva atómica del cap (3/mes Free, Pro ilimitado, airbag global).
    requestId = crypto.randomUUID();
    const { data: gate } = await safeRpc(supabase, 'consumir_reco', { p_request_id: requestId });
    if (!gate || !gate.allowed) {
      requestId = null;
      if (gate?.reason === 'free_limit') {
        const cap = Number(process.env.DESPENSA_RECO_FREE_LIMIT) || 3;
        return NextResponse.json(
          { error: 'Llegaste a tus recomendaciones con tu despensa este mes.', ...limitPayload({ feature: 'despensa_reco', usage: { plan: 'free', used: cap, cap, remaining: 0, resetLabel: nextResetLabel() } }) },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: 'La recomendación no está disponible por el momento.', reason: gate?.reason }, { status: 503 });
    }

    const { date } = localDateTime();
    const [{ data: targets }, { data: meals }, { data: profile }, pantryItems] = await Promise.all([
      supabase.from('nutrition_targets').select('kcal_target, protein_g, carbs_g, fat_g').eq('user_id', user.id).maybeSingle(),
      supabase.from('meals').select('calories, protein_g, carbs_g, fat_g').eq('user_id', user.id).eq('date', date),
      supabase.from('nutrition_profiles').select('coach, allergies, intolerances').eq('user_id', user.id).maybeSingle(),
      readItemsParaMatching(supabase, user.id),
    ]);

    const sum = (meals || []).reduce(
      (a, m) => ({ kcal: a.kcal + (m.calories || 0), prot: a.prot + (m.protein_g || 0), carb: a.carb + (m.carbs_g || 0), gras: a.gras + (m.fat_g || 0) }),
      { kcal: 0, prot: 0, carb: 0, gras: 0 }
    );
    const pendientes = targets
      ? { kcal: Math.round(targets.kcal_target - sum.kcal), prot: Math.round(targets.protein_g - sum.prot), carb: Math.round(targets.carbs_g - sum.carb), gras: Math.round(targets.fat_g - sum.gras) }
      : { kcal: 0, prot: 0, carb: 0, gras: 0 };
    const objetivo = profile?.coach || 'bienestar';
    const restricciones = [...(profile?.allergies || []), ...(profile?.intolerances || [])];

    // Matching DETERMINISTA (Karpathy). El filtro de alérgenos ya va dentro (findViolations).
    const opciones = quePuedoComer(pendientes, pantryItems, objetivo, restricciones, { hoy: date, max: 3 });

    if (!opciones || !opciones.length) {
      // Sin opciones (despensa vacía o nada seguro cuadra) → no cobrar el cap: reembolsar.
      await safeRpc(supabase, 'reembolsar_ia', { p_request_id: requestId });
      requestId = null;
      const mensaje = pantryItems.length
        ? 'Con lo que tienes en la despensa no encontré algo que cuadre y sea seguro. Agrega algo o dime qué tienes.'
        : 'Tu despensa está vacía. Agrega lo que tienes en casa y te digo qué puedes comer.';
      return NextResponse.json({ opciones: [], mensaje });
    }

    requestId = null;
    return NextResponse.json({ opciones, remaining: gate.remaining ?? null });
  } catch (err) {
    console.error('que-puedo-comer EXCEPCION:', err?.message);
    if (supabase && requestId) await safeRpc(supabase, 'reembolsar_ia', { p_request_id: requestId });
    return NextResponse.json({ error: 'No pude calcular la recomendación. Intenta de nuevo.' }, { status: 200 });
  }
}
