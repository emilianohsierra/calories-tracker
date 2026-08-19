import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mesesCompletos, tramosAlcanzados } from './evaluar.js';
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
});

describe('lealtad · otorgarTramo (DOBLE idempotencia, cero doble-otorgar)', () => {
  const tramo = tramoDe('pro_6m');
  beforeEach(() => { process.env.LEALTAD_ON = '1'; });
  afterEach(() => { delete process.env.LEALTAD_ON; delete process.env.LEALTAD_GRANT_ON; });

  const adminOk = () => ({ from: () => ({ insert: async () => ({ error: null }), update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }) });

  it('reclamo duplicado (23505) → ya_reclamado (NO re-otorga)', async () => {
    const admin = { from: () => ({ insert: async () => ({ error: { code: '23505' } }) }) };
    const r = await otorgarTramo(admin, null, { userId: 'u1', tramo });
    expect(r).toEqual({ ok: true, reason: 'ya_reclamado' });
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
