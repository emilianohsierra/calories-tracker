// Gamificación V1 — wrapper SERVER (best-effort). Envuelve la RPC otorgar_evento y el desbloqueo de
// logros. NUNCA lanza ni bloquea: la gamificación es aditiva y no puede romper el write-path host.
// Gated por env GAMIFICACION_ON (off → no-op → todo sigue igual).
import { claveDedupe, logrosDe } from './eventos';

export const GAMIFICACION_ON = process.env.GAMIFICACION_ON === '1';
const activa = () => process.env.GAMIFICACION_ON === '1'; // runtime (testeable; en prod el env es estático)

// Otorga un evento (idempotente vía la RPC). `ref` = id/dia según el tipo (ver claveDedupe). `userId` solo
// lo pasa el CRON (service_role) para eventos estado-derivados; in-request se omite (la RPC usa auth.uid()).
// NOTA (Slowking): el XP lo DERIVA la RPC server-side por tipo. El cliente NO manda p_xp (no farmeable).
export async function otorgar(supabase, tipo, ref, { userId } = {}) {
  if (!activa() || !supabase || !tipo) return { awarded: false, reason: 'off' };
  try {
    const args = { p_tipo: tipo, p_clave_dedupe: claveDedupe(tipo, ref) };
    if (userId) args.p_user_id = userId;
    const { data, error } = await supabase.rpc('otorgar_evento', args);
    if (error) { console.error('[gam] otorgar_evento falló:', { code: error.code }); return { awarded: false, reason: 'rpc_error' }; }
    return data || { awarded: false };
  } catch (e) { console.error('[gam] otorgar excepción:', e?.message); return { awarded: false, reason: 'exc' }; }
}

// Desbloquea (idempotente) los logros cuyo criterio cumple `estado` agregado. `userId` requerido (RLS
// exige user_id = auth.uid() in-request; el cron pasa el target). Devuelve los códigos evaluados.
export async function desbloquearLogros(supabase, estado, userId, dia = null) {
  if (!activa() || !supabase || !userId) return [];
  try {
    const codes = logrosDe(estado);
    if (!codes.length) return [];
    const filas = codes.map((code) => ({ user_id: userId, logro_code: code, dia }));
    const { error } = await supabase.from('user_achievements').upsert(filas, { onConflict: 'user_id,logro_code', ignoreDuplicates: true });
    if (error) { console.error('[gam] desbloquear falló:', { code: error.code }); return []; }
    return codes;
  } catch (e) { console.error('[gam] desbloquear excepción:', e?.message); return []; }
}
