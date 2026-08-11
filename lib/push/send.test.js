import { describe, it, expect, vi } from 'vitest';
import { enviarPush, pushConfigurado } from './send.js';

const subs = [
  { endpoint: 'https://push/a', p256dh: 'pa', auth: 'aa' },
  { endpoint: 'https://push/b', p256dh: 'pb', auth: 'ab' },
];
const payload = { title: 'T', body: 'B', url: '/coach', tag: 'streak' };

describe('push · enviarPush', () => {
  it('sin VAPID configurado (sin sender) → no-op, 0 enviados (solo in-app)', async () => {
    // En el entorno de test no hay env VAPID → senderPorDefecto() = null.
    expect(pushConfigurado()).toBe(false);
    const r = await enviarPush(subs, payload);
    expect(r).toEqual({ enviados: 0, muertos: [] });
  });

  it('sin suscripciones → no-op', async () => {
    const r = await enviarPush([], payload, { sender: vi.fn() });
    expect(r.enviados).toBe(0);
  });

  it('envía a cada suscripción (sender inyectado)', async () => {
    const sender = vi.fn(async () => ({}));
    const r = await enviarPush(subs, payload, { sender });
    expect(r.enviados).toBe(2);
    expect(r.muertos).toEqual([]);
    expect(sender).toHaveBeenCalledTimes(2);
    // el payload se serializa a string
    expect(typeof sender.mock.calls[0][1]).toBe('string');
    expect(JSON.parse(sender.mock.calls[0][1]).title).toBe('T');
  });

  it('410/404 → marca la suscripción como MUERTA (para limpiar), sigue con las demás', async () => {
    const sender = vi.fn(async (sub) => {
      if (sub.endpoint === 'https://push/a') { const e = new Error('gone'); e.statusCode = 410; throw e; }
      return {};
    });
    const r = await enviarPush(subs, payload, { sender });
    expect(r.enviados).toBe(1);
    expect(r.muertos).toEqual(['https://push/a']);
  });

  it('otros errores (p.ej. 500/red) NO marcan muerta (best-effort)', async () => {
    const sender = vi.fn(async () => { const e = new Error('boom'); e.statusCode = 500; throw e; });
    const r = await enviarPush(subs, payload, { sender });
    expect(r.enviados).toBe(0);
    expect(r.muertos).toEqual([]);
  });
});
