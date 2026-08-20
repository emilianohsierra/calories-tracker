// Gamificación V2.1 — FUNDACIÓN (S0): flags de encendido + kill-switch (server-side, sin redeploy) +
// helpers de lectura DEPLOY-SAFE. Regla: sin la migración gamificacion-v2.sql / flag off / kill on / tabla
// ausente (42P01) → los features V2 degradan a vacío/null y V1 queda INTACTO. El cron SALTA V2 si !v2Activo.
//
// Frontera de confianza (V1): esto es solo lectura/gating; el XP/otorgamiento sigue 100% en la RPC
// otorgar_evento (server-side, no farmeable). Este módulo NUNCA otorga.

// Flags por env. Runtime (testeable con stubEnv; en prod el env es estático). GAMIFICACION_V2_ON gatea los
// 4 features; RETOS_ON/CHECKIN_ON son flags de ETAPA para lanzar rebanada por rebanada.
export const GAMIFICACION_V2_ON = process.env.GAMIFICACION_V2_ON === '1';
const v2Flag = () => process.env.GAMIFICACION_V2_ON === '1';
export const retosFlag = () => v2Flag() && process.env.RETOS_ON === '1';
export const checkinFlag = () => v2Flag() && process.env.CHECKIN_ON === '1';

// Kill-switches server-side (app_config) vía RPC SECURITY DEFINER → instantáneo, sin redeploy, en cualquier
// cliente. Deploy-safe: RPC/columna ausente o error → { v2:false, retos:false } (no matado; el flag env gatea).
export async function leerKill(supabase) {
  if (!supabase) return { v2: false, retos: false };
  try {
    const { data, error } = await supabase.rpc('gamificacion_v2_kill');
    if (error || !data) return { v2: false, retos: false };
    return { v2: data.v2 === true, retos: data.retos === true };
  } catch { return { v2: false, retos: false }; }
}

// ¿V2 activo? = flag env ON y kill-switch OFF. Off → los features V2 desaparecen (V1 intacto).
export async function v2Activo(supabase) {
  if (!v2Flag()) return false;
  return !(await leerKill(supabase)).v2;
}
// ¿Retos activos? = V2 activo + flag de etapa RETOS_ON + su kill OFF.
export async function retosActivo(supabase) {
  if (!retosFlag()) return false;
  const k = await leerKill(supabase);
  return !k.v2 && !k.retos;
}
// ¿Check-in activo? = V2 activo + flag de etapa CHECKIN_ON.
export async function checkinActivo(supabase) {
  if (!checkinFlag()) return false;
  return !(await leerKill(supabase)).v2;
}

// Lectura DEPLOY-SAFE de una tabla V2 (challenge_progress / checkins). Sin flag / tabla ausente (42P01) /
// error → `fallback` (default []). `aplicar` recibe el query builder de la tabla y lo termina.
export async function leerV2(supabase, tabla, aplicar, fallback = []) {
  if (!supabase || !v2Flag()) return fallback;
  try {
    const { data, error } = await aplicar(supabase.from(tabla));
    if (error) return fallback; // 42P01 (tabla ausente) u otra → V1 intacto
    return data ?? fallback;
  } catch { return fallback; }
}
