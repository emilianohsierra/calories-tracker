// Gamificación V2.1 · S3 — bloque de contexto para el COACH (READ-ONLY, server-side).
// Lee progreso/racha/logros/reto activo/último check-in y arma un bloque de texto BREVE para que
// el coach reconozca el momentum del usuario con calidez, SIN inventar cifras.
//
// FRONTERA DE CONFIANZA: esto es SOLO lectura; jamás otorga XP ni muta (eso vive en las RPC
// server-side de V1/V2). No se engancha en páginas (la UI la monta Rams): se llama desde el
// builder de contexto del coach (lib/coach/context.js).
//
// TCA + salud (línea roja): todo texto libre pasa por el cinturón esDatoDeSalud →
//   1) la NOTA del check-in solo entra si NO huele a salud/síntoma (eso va a restricciones, no al chat);
//   2) el título del reto pasa por copySeguro (intents TCA prohibidos);
//   3) POST-CHECK: el bloque ENTERO se revalida con esDatoDeSalud → si algo se coló, fallback = ''.
// DEPLOY-SAFE: v2 off / kill-switch / tablas ausentes / error → '' (el contexto del coach queda intacto).
import { v2Activo } from '../gamification/v2';
import { esDatoDeSalud } from './actions';
import { RETOS, copySeguro } from '../gamification/retos';

// Título legible de un reto desde el catálogo (config TCA-safe). Null si no está catalogado.
function retoTitulo(challengeId) {
  const r = RETOS.find((x) => x.id === challengeId);
  return r?.titulo || null;
}

export async function bloqueGamificacion(supabase, userId) {
  if (!supabase || !userId) return '';
  // Gate: sin V2 activo (flag off / kill-switch) → bloque vacío, V1 intacto.
  if (!(await v2Activo(supabase))) return '';

  // Lecturas en paralelo, cada una deploy-safe (tabla ausente 42P01 / error → null).
  const safe = (q) => q.then((r) => r.data).catch(() => null);
  const [progreso, streak, logros, reto, checkin] = await Promise.all([
    safe(supabase.from('user_progress').select('xp_total').eq('user_id', userId).maybeSingle()),
    safe(supabase.from('user_streaks').select('actual, mejor').eq('user_id', userId).maybeSingle()),
    safe(
      supabase
        .from('user_achievements')
        .select('logro_code, unlocked_at')
        .eq('user_id', userId)
        .order('unlocked_at', { ascending: false })
        .limit(3)
    ),
    safe(
      supabase
        .from('challenge_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('estado', 'activo')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ),
    safe(
      supabase
        .from('checkins')
        .select('*')
        .eq('user_id', userId)
        .order('dia', { ascending: false })
        .limit(1)
        .maybeSingle()
    ),
  ]);

  const lineas = [];

  const racha = Number(streak?.actual) || 0;
  if (racha > 0) {
    lineas.push(`- Racha de registro: ${racha} día${racha === 1 ? '' : 's'} seguido${racha === 1 ? '' : 's'}.`);
  }

  const xp = Number(progreso?.xp_total) || 0;
  if (xp > 0) lineas.push(`- XP acumulado: ${xp}.`);

  if (Array.isArray(logros) && logros.length) {
    lineas.push(`- Logros desbloqueados recientemente: ${logros.length}.`);
  }

  if (reto?.challenge_id) {
    const titulo = retoTitulo(reto.challenge_id);
    // Doble cinturón TCA: solo si el catálogo lo tiene y su copy no cruza la línea roja.
    if (titulo && copySeguro(titulo)) {
      const prog = Number(reto.progreso) || 0;
      const meta = Number(reto.meta) || 0;
      const detalle = meta > 0 ? ` (${Math.min(prog, meta)}/${meta})` : '';
      lineas.push(`- Reto activo: ${titulo}${detalle}.`);
    }
  }

  if (checkin) {
    const animo = typeof checkin.animo === 'string' ? checkin.animo.trim() : '';
    const energia = Number(checkin.energia) || null;
    if (animo || energia) {
      lineas.push(
        `- Último check-in de ánimo: ${animo || 'registrado'}${energia ? ` (energía ${energia}/5)` : ''}.`
      );
    }
    // La NOTA libre del usuario solo entra si NO es dato de salud/síntoma (TCA + privacidad).
    const nota = typeof checkin.nota === 'string' ? checkin.nota.trim() : '';
    if (nota && !esDatoDeSalud(nota)) {
      lineas.push(`- Nota del usuario en su check-in: "${nota.slice(0, 160)}".`);
    }
  }

  if (!lineas.length) return '';

  const bloque = `\n<gamificacion>\nProgreso reciente del usuario (reconócelo con calidez; SOLO conducta sana, NUNCA peso/dieta/comer de menos):\n${lineas.join('\n')}\n</gamificacion>`;

  // POST-CHECK final (belt-and-suspenders): si algo en el bloque huele a salud, se descarta entero.
  if (esDatoDeSalud(bloque)) return '';
  return bloque;
}
