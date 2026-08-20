import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retosFlag, checkinFlag, leerKill, v2Activo, retosActivo, checkinActivo, leerV2 } from './v2.js';

// Mock supabase: rpc('gamificacion_v2_kill') + from(tabla).<query> → resultado inyectable.
const supa = ({ kill = { v2: false, retos: false }, killError = null, data = [], dataError = null } = {}) => ({
  rpc: vi.fn(async () => ({ data: killError ? null : kill, error: killError })),
  from: () => ({ select: () => ({ eq: () => Promise.resolve({ data, error: dataError }) }) }),
});

describe('gamificación V2 · flags + kill-switch + deploy-safe', () => {
  beforeEach(() => { delete process.env.GAMIFICACION_V2_ON; delete process.env.RETOS_ON; delete process.env.CHECKIN_ON; });
  afterEach(() => { delete process.env.GAMIFICACION_V2_ON; delete process.env.RETOS_ON; delete process.env.CHECKIN_ON; });

  it('flag off → todo inactivo (V1 intacto)', async () => {
    expect(await v2Activo(supa())).toBe(false);
    expect(retosFlag()).toBe(false);
    expect(checkinFlag()).toBe(false);
  });

  it('GAMIFICACION_V2_ON=1 + kill off → v2Activo true', async () => {
    process.env.GAMIFICACION_V2_ON = '1';
    expect(await v2Activo(supa({ kill: { v2: false, retos: false } }))).toBe(true);
  });

  it('kill-switch V2 on → v2Activo false (apagado sin redeploy)', async () => {
    process.env.GAMIFICACION_V2_ON = '1';
    expect(await v2Activo(supa({ kill: { v2: true, retos: false } }))).toBe(false);
  });

  it('leerKill deploy-safe: RPC ausente/error → { v2:false, retos:false } (no mata)', async () => {
    expect(await leerKill(supa({ killError: { code: '42883' } }))).toEqual({ v2: false, retos: false });
    expect(await leerKill(null)).toEqual({ v2: false, retos: false });
  });

  it('retos: requiere V2_ON + RETOS_ON + ambos kills off', async () => {
    process.env.GAMIFICACION_V2_ON = '1';
    expect(await retosActivo(supa())).toBe(false); // RETOS_ON falta
    process.env.RETOS_ON = '1';
    expect(await retosActivo(supa({ kill: { v2: false, retos: false } }))).toBe(true);
    expect(await retosActivo(supa({ kill: { v2: false, retos: true } }))).toBe(false); // retos_kill on
    expect(await retosActivo(supa({ kill: { v2: true, retos: false } }))).toBe(false); // v2_kill on
  });

  it('check-in: requiere V2_ON + CHECKIN_ON', async () => {
    process.env.GAMIFICACION_V2_ON = '1';
    expect(await checkinActivo(supa())).toBe(false);
    process.env.CHECKIN_ON = '1';
    expect(await checkinActivo(supa())).toBe(true);
  });

  it('leerV2 deploy-safe: flag off → fallback; tabla ausente (42P01) → fallback; ok → data', async () => {
    expect(await leerV2(supa(), 'challenge_progress', (q) => q.select('*').eq('user_id', 'u'), [])).toEqual([]); // flag off
    process.env.GAMIFICACION_V2_ON = '1';
    expect(await leerV2(supa({ dataError: { code: '42P01' } }), 'checkins', (q) => q.select('*').eq('user_id', 'u'))).toEqual([]);
    expect(await leerV2(supa({ data: [{ dia: '2026-08-19' }] }), 'checkins', (q) => q.select('*').eq('user_id', 'u'))).toEqual([{ dia: '2026-08-19' }]);
  });
});
