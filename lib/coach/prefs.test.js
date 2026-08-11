import { describe, it, expect } from 'vitest';
import { sanitizarPrefs, PREFS_DEFAULT, MODOS } from './prefs.js';

describe('prefs · sanitizarPrefs (nunca confía en el cliente)', () => {
  it('acepta modo válido, ignora modo inválido', () => {
    expect(sanitizarPrefs({ modo: 'entrenador' }).modo).toBe('entrenador');
    expect(sanitizarPrefs({ modo: 'hacker' }).modo).toBeUndefined();
    expect(MODOS).toContain(PREFS_DEFAULT.modo);
  });
  it('clampa quiet_start/end a enteros 0-23 y descarta fuera de rango', () => {
    expect(sanitizarPrefs({ quiet_start: 22, quiet_end: 8 })).toEqual({ quiet_start: 22, quiet_end: 8 });
    expect(sanitizarPrefs({ quiet_start: 25 }).quiet_start).toBeUndefined();
    expect(sanitizarPrefs({ quiet_start: -1 }).quiet_start).toBeUndefined();
    expect(sanitizarPrefs({ quiet_start: 9.7 }).quiet_start).toBe(9); // trunca
  });
  it('coacciona los toggles a booleano', () => {
    const p = sanitizarPrefs({ proactive_on: 0, on_streak: 1, on_user_inactivity: true });
    expect(p.proactive_on).toBe(false);
    expect(p.on_streak).toBe(true);
    expect(p.on_user_inactivity).toBe(true);
  });
  it('ignora campos desconocidos (user_id, tablas, etc.)', () => {
    const p = sanitizarPrefs({ user_id: 'otro', modo: 'tranquilo', evil: 'x' });
    expect(p).toEqual({ modo: 'tranquilo' });
  });
  it('body vacío → patch vacío', () => {
    expect(sanitizarPrefs({})).toEqual({});
    expect(sanitizarPrefs()).toEqual({});
  });
});
