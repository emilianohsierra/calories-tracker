import { describe, it, expect } from 'vitest';
import { limitPayload, plansPayload, readPaywall } from './paywall.js';
import { isPro, canUseCoach, limiteRestanteCoach } from './coach/gating.js';

describe('paywall · contrato backend (Drucker §4)', () => {
  it('limitPayload = 429 variant limit con feature+usage', () => {
    const p = limitPayload({ feature: 'coach_chat', usage: { plan: 'free', used: 3, cap: 3, remaining: 0, resetLabel: '1 sep' } });
    expect(p).toMatchObject({ blocked: true, feature: 'coach_chat', variant: 'limit' });
    expect(p.usage.cap).toBe(3);
  });

  it('plansPayload = variant plans (feature Pro-only)', () => {
    expect(plansPayload({ feature: 'reanalisis' })).toEqual({ blocked: true, feature: 'reanalisis', variant: 'plans' });
  });

  it('readPaywall detecta 429/403 con blocked; ignora el resto', () => {
    expect(readPaywall(429, { blocked: true, feature: 'analisis', variant: 'limit', usage: {} })).toMatchObject({ variant: 'limit', feature: 'analisis' });
    expect(readPaywall(403, { blocked: true, feature: 'x', variant: 'plans' })).toMatchObject({ variant: 'plans' });
    expect(readPaywall(200, { response: {} })).toBeNull();
    expect(readPaywall(503, { error: 'x' })).toBeNull();
    expect(readPaywall(429, { error: 'x' })).toBeNull(); // sin blocked → no es paywall
  });

  it('readPaywall default variant plans si falta', () => {
    expect(readPaywall(403, { blocked: true }).variant).toBe('plans');
  });
});

describe('coach gating (UI: muro después del valor)', () => {
  it('isPro por plan', () => {
    expect(isPro({ plan: 'pro' })).toBe(true);
    expect(isPro({ plan: 'free' })).toBe(false);
    expect(isPro(null)).toBe(false);
  });

  it('Pro = ilimitado; Free usa remaining del coach si se conoce', () => {
    expect(limiteRestanteCoach({ plan: 'pro' })).toBe(Infinity);
    expect(limiteRestanteCoach({ plan: 'free', coach: { remaining: 2 } })).toBe(2);
    expect(limiteRestanteCoach({ plan: 'free' })).toBe(Infinity); // desconocido → no pre-bloquear
  });

  it('canUseCoach: Pro siempre; Free mientras quede degustación', () => {
    expect(canUseCoach({ plan: 'pro' })).toBe(true);
    expect(canUseCoach({ plan: 'free', coach: { remaining: 1 } })).toBe(true);
    expect(canUseCoach({ plan: 'free', coach: { remaining: 0 } })).toBe(false);
  });
});
