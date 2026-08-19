// Lealtad — OTORGAMIENTO server-side con DOBLE idempotencia (cero doble-otorgar). Best-effort, nunca lanza.
// SOLO lo llama el CRON (service_role); el cliente jamás escribe loyalty_rewards. Dos cinturones:
//   (1) DB ledger: insert-on-conflict ANTES de Stripe → si el tramo ya se reclamó, no se re-otorga.
//   (2) Stripe idempotencyKey='loyalty:<user>:<tramo>' → aunque el proceso muera y el cron reintente, Stripe dedupea.
// DOS flags: LEALTAD_ON (evalúa + reclama en el ledger; seguro en TEST) · LEALTAD_GRANT_ON (otorgamiento REAL
// en Stripe; OFF por defecto, se enciende SOLO con Stripe LIVE + visto bueno). Separa "lógica lista" de "grant real".
import { TRAMOS } from './tramos';
import { tramosAlcanzados } from './evaluar';

export const LEALTAD_ON = process.env.LEALTAD_ON === '1';
export const LEALTAD_GRANT_ON = process.env.LEALTAD_GRANT_ON === '1';
// Lectura RUNTIME (testeable; en prod el env es estático).
const lealtadOn = () => process.env.LEALTAD_ON === '1';
const grantOn = () => process.env.LEALTAD_GRANT_ON === '1';

// Otorga UN tramo. admin=service_role; stripe=getStripe(). precioMesCents = precio de 1 mes (para el crédito).
export async function otorgarTramo(admin, stripe, { userId, tramo, customerId, precioMesCents, currency = 'mxn' } = {}) {
  if (!userId || !tramo) return { ok: false, reason: 'args' };
  // (1) RECLAMO idempotente en el ledger (PK user_id,tramo_code). Si choca (23505) → ya reclamado → no re-otorga.
  const { error: eIns } = await admin.from('loyalty_rewards').insert({ user_id: userId, tramo_code: tramo.code, estado: 'pendiente' });
  if (eIns) {
    if (eIns.code === '23505') return { ok: true, reason: 'ya_reclamado' }; // idempotente: tramo ya otorgado/pendiente
    console.error('[lealtad] ledger insert:', { code: eIns.code });
    return { ok: false, reason: 'ledger_error' };
  }
  // (2) Grant real apagado (TEST/pre-LIVE): queda reclamado 'pendiente' (lógica lista, sin mover dinero).
  if (!grantOn()) return { ok: true, reason: 'reclamado_grant_off' };
  if (!stripe || !customerId || !(precioMesCents > 0)) {
    await admin.from('loyalty_rewards').update({ estado: 'error' }).eq('user_id', userId).eq('tramo_code', tramo.code);
    return { ok: false, reason: 'sin_stripe_o_precio' };
  }
  // (3) Crédito en factura (balance transaction NEGATIVO = crédito), idempotencyKey = 2º cinturón.
  try {
    const monto = Math.abs(precioMesCents) * (tramo.meses_gratis || 1);
    const tx = await stripe.customers.createBalanceTransaction(
      customerId,
      { amount: -monto, currency, description: `Lealtad ${tramo.code}: ${tramo.meses_gratis} mes(es) gratis por tu antigüedad` },
      { idempotencyKey: `loyalty:${userId}:${tramo.code}` },
    );
    await admin.from('loyalty_rewards').update({ estado: 'otorgado', stripe_ref: tx?.id || null, otorgado_en: new Date().toISOString() }).eq('user_id', userId).eq('tramo_code', tramo.code);
    return { ok: true, reason: 'otorgado', stripe_ref: tx?.id || null };
  } catch (e) {
    console.error('[lealtad] stripe balance tx:', e?.message);
    await admin.from('loyalty_rewards').update({ estado: 'error' }).eq('user_id', userId).eq('tramo_code', tramo.code); // el cron reintenta (idempotencyKey lo hace seguro)
    return { ok: false, reason: 'stripe_error' };
  }
}

// Evalúa la antigüedad Pro de UN usuario y otorga los tramos alcanzados-y-no-otorgados. Lo llama el cron.
export async function procesarLealtad(admin, stripe, { userId, proSince, customerId, precioMesCents, currency, hoy } = {}) {
  if (!lealtadOn() || !userId || !proSince) return { evaluados: 0 };
  const codes = tramosAlcanzados(proSince, hoy);
  let n = 0;
  for (const code of codes) {
    const tramo = TRAMOS.find((t) => t.code === code);
    if (!tramo) continue;
    await otorgarTramo(admin, stripe, { userId, tramo, customerId, precioMesCents, currency }); // idempotente
    n += 1;
  }
  return { evaluados: n };
}
