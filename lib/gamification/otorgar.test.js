import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { otorgar } from './otorgar.js';
import { XP } from './config.js';
import { EVENTOS } from './eventos.js';

// El XP que la RPC deriva server-side (debe ser IDÉNTICO a config.XP; si divergen, la RPC gana pero el
// test avisa del drift). Espejo de supabase/gamificacion-v1-fix.sql.
const XP_RPC = {
  MEAL_LOGGED: 10, PANTRY_ITEM_ADDED: 5, LESSON_COMPLETED: 25, WORKOUT_LOGGED: 15,
  CHECKIN_COMPLETED: 5, DAY_COMPLETED: 20, GOAL_REACHED: 30, WEEKLY_CONSISTENT: 100,
};

describe('gamificación · otorgar (Slowking: cliente NO controla el XP)', () => {
  beforeEach(() => { process.env.GAMIFICACION_ON = '1'; });
  afterEach(() => { delete process.env.GAMIFICACION_ON; });

  it('la RPC se llama SIN p_xp (el monto lo deriva el server, no el cliente)', async () => {
    const rpc = vi.fn(async () => ({ data: { awarded: true, xp_total: 10 }, error: null }));
    await otorgar({ rpc }, EVENTOS.MEAL_LOGGED, 42);
    expect(rpc).toHaveBeenCalledOnce();
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('otorgar_evento');
    expect(args).toEqual({ p_tipo: 'MEAL_LOGGED', p_clave_dedupe: 'meal:42' });
    expect(args).not.toHaveProperty('p_xp'); // ← el cliente ya no manda XP
  });

  it('el cron pasa p_user_id (estado-derivado) pero TAMPOCO p_xp', async () => {
    const rpc = vi.fn(async () => ({ data: { awarded: true }, error: null }));
    await otorgar({ rpc }, EVENTOS.WEEKLY_CONSISTENT, '2026-W33', { userId: 'u9' });
    const [, args] = rpc.mock.calls[0];
    expect(args).toEqual({ p_tipo: 'WEEKLY_CONSISTENT', p_clave_dedupe: 'semana:2026-W33', p_user_id: 'u9' });
    expect(args).not.toHaveProperty('p_xp');
  });

  it('flag off → no-op (no toca la RPC)', async () => {
    delete process.env.GAMIFICACION_ON;
    const rpc = vi.fn();
    const r = await otorgar({ rpc }, EVENTOS.MEAL_LOGGED, 1);
    expect(rpc).not.toHaveBeenCalled();
    expect(r.reason).toBe('off');
  });

  it('config.XP (JS) y el CASE de la RPC (SQL) están alineados', () => {
    for (const [tipo, monto] of Object.entries(XP_RPC)) expect(XP[tipo]).toBe(monto);
  });
});
