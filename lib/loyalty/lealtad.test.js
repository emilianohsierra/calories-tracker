import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mesesCompletos, tramosAlcanzados, proximoTramo } from './evaluar.js';
import { otorgarTramo } from './otorgar.js';
import { tramoDe } from './tramos.js';

describe('lealtad · evaluación de tramos (antigüedad Pro)', () => {
  it('mesesCompletos cuenta meses cumplidos (no fracciones)', () => {
    expect(mesesCompletos('2026-01-15', '2026-07-15')).toBe(6);
    expect(mesesCompletos('2026-01-15', '2026-07-14')).toBe(5); // aún no se cumple el día
    expect(mesesCompletos('2025-08-19', '2026-08-19')).toBe(12);
  });
  it('tramosAlcanzados: 6m→pro_6m; 12m→ambos; <6m→[]; sin pro_since→[]', () => {
    expect(tramosAlcanzados('2026-02-01', '2026-08-01')).toEqual(['pro_6m']); // 6 meses
    expect(tramosAlcanzados('2025-08-01', '2026-08-01')).toEqual(['pro_6m', 'pro_12m']); // 12 meses
    expect(tramosAlcanzados('2026-06-01', '2026-08-01')).toEqual([]); // 2 meses
    expect(tramosAlcanzados(null, '2026-08-01')).toEqual([]);
  });
  it('proximoTramo (informativo para la tarjeta): faltan meses; null-safe; todos → null', () => {
    expect(proximoTramo(0)).toEqual({ code: 'pro_6m', meses: 6, faltan: 6, meses_gratis: 1 });   // sin pro_since
    expect(proximoTramo(4)).toEqual({ code: 'pro_6m', meses: 6, faltan: 2, meses_gratis: 1 });   // llevas 4 de 6
    expect(proximoTramo(6)).toEqual({ code: 'pro_12m', meses: 12, faltan: 6, meses_gratis: 2 }); // ya en pro_6m → siguiente
    expect(proximoTramo(12)).toBeNull(); // todos alcanzados
  });
});

describe('lealtad · otorgarTramo (DOBLE idempotencia, cero doble-otorgar)', () => {
  const tramo = tramoDe('pro_6m');
  beforeEach(() => { process.env.LEALTAD_ON = '1'; });
  afterEach(() => { delete process.env.LEALTAD_ON; delete process.env.LEALTAD_GRANT_ON; });

  const adminOk = () => ({ from: () => ({ insert: async () => ({ error: null }), update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }) });
  // Conflicto de ledger (23505): la fila ya existe con `estado`. Mock con insert→23505 + select(estado) + update.
  const adminConflicto = (estado) => ({
    from: () => ({
      insert: async () => ({ error: { code: '23505' } }),
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { estado } }) }) }) }),
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  });

  it('conflicto + estado OTORGADO → ya_reclamado (NO re-otorga, NO toca Stripe)', async () => {
    process.env.LEALTAD_GRANT_ON = '1';
    const create = vi.fn();
    const r = await otorgarTramo(adminConflicto('otorgado'), { customers: { createBalanceTransaction: create } }, { userId: 'u1', tramo, customerId: 'cus_1', precioMesCents: 9900 });
    expect(r).toEqual({ ok: true, reason: 'ya_reclamado' });
    expect(create).not.toHaveBeenCalled();
  });

  it('FIX-a rollout: conflicto + estado PENDIENTE + grant ON → PROCEDE a Stripe (no se queda atascado)', async () => {
    process.env.LEALTAD_GRANT_ON = '1';
    const create = vi.fn(async () => ({ id: 'cbtxn_9' }));
    const r = await otorgarTramo(adminConflicto('pendiente'), { customers: { createBalanceTransaction: create } }, { userId: 'u1', tramo, customerId: 'cus_1', precioMesCents: 9900 });
    expect(r.reason).toBe('otorgado'); // ← el tramo reclamado con grant-off SÍ recibe su crédito al encender grant
    expect(create.mock.calls[0][2].idempotencyKey).toBe('loyalty:u1:pro_6m');
  });

  it('conflicto + estado PENDIENTE + grant OFF → sigue reclamado (sin mover dinero)', async () => {
    const create = vi.fn();
    const r = await otorgarTramo(adminConflicto('pendiente'), { customers: { createBalanceTransaction: create } }, { userId: 'u1', tramo, customerId: 'cus_1', precioMesCents: 9900 });
    expect(r.reason).toBe('reclamado_grant_off');
    expect(create).not.toHaveBeenCalled();
  });

  it('grant OFF (TEST/pre-LIVE) → reclama en el ledger pero NO toca Stripe (lógica lista)', async () => {
    const stripe = { customers: { createBalanceTransaction: vi.fn() } };
    const r = await otorgarTramo(adminOk(), stripe, { userId: 'u1', tramo, customerId: 'cus_1', precioMesCents: 9900 });
    expect(r.reason).toBe('reclamado_grant_off');
    expect(stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
  });

  it('grant ON → crédito en Stripe con idempotencyKey estable (2º cinturón) y monto = precio×meses_gratis', async () => {
    process.env.LEALTAD_GRANT_ON = '1';
    const create = vi.fn(async () => ({ id: 'cbtxn_1' }));
    const stripe = { customers: { createBalanceTransaction: create } };
    const r = await otorgarTramo(adminOk(), stripe, { userId: 'u1', tramo, customerId: 'cus_1', precioMesCents: 9900, currency: 'mxn' });
    expect(r.reason).toBe('otorgado');
    const [customer, params, opts] = create.mock.calls[0];
    expect(customer).toBe('cus_1');
    expect(params.amount).toBe(-9900 * tramo.meses_gratis); // crédito NEGATIVO = un mes gratis
    expect(opts.idempotencyKey).toBe('loyalty:u1:pro_6m'); // dedupe saliente
  });
});
