// Lealtad — evaluación PURA de tramos por antigüedad de suscripción Pro. Determinista, 0 IA.
import { TRAMOS } from './tramos';

// Meses COMPLETOS entre dos fechas (Date o 'YYYY-MM-DD'). Cuenta un mes solo cuando se cumple el día.
export function mesesCompletos(desde, hasta) {
  const a = desde instanceof Date ? desde : new Date(`${String(desde).slice(0, 10)}T00:00:00Z`);
  const b = hasta instanceof Date ? hasta : new Date(`${String(hasta).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m -= 1; // aún no se cumple el día del mes
  return Math.max(0, m);
}

// Tramos ALCANZADOS a `hoy` dado `pro_since` (antigüedad Pro). Devuelve los códigos (config). Sin pro_since → [].
export function tramosAlcanzados(proSince, hoy) {
  if (!proSince) return [];
  const m = mesesCompletos(proSince, hoy);
  return TRAMOS.filter((t) => m >= t.meses).map((t) => t.code);
}

// Próximo tramo INFORMATIVO dado los meses Pro (para la tarjeta): el 1er tramo aún no alcanzado, con
// `faltan` meses. Sin pro_since (meses 0) → el primer tramo. Todos alcanzados → null. PURO.
export function proximoTramo(mesesPro = 0) {
  const m = Math.max(0, Number(mesesPro) || 0);
  const t = TRAMOS.find((x) => m < x.meses); // el primer tramo cuyo umbral aún no se cumple
  if (!t) return null;
  return { code: t.code, meses: t.meses, faltan: Math.max(0, t.meses - m), meses_gratis: t.meses_gratis };
}
