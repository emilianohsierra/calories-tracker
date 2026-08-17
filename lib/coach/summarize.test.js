import { describe, it, expect, vi } from 'vitest';
import { seleccionarDelta, mantenerResumen } from './summarize.js';

const hilo = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i + 1), role: i % 2 ? 'assistant' : 'user', content: `m${i + 1}` }));

describe('summarize · seleccionarDelta (puro)', () => {
  it('hilo dentro de la ventana → sin delta', () => {
    expect(seleccionarDelta(hilo(3), null, 3).delta).toEqual([]);
  });
  it('hilo largo sin upto → delta = todo lo anterior a la ventana reciente', () => {
    const { delta, nuevoUpto } = seleccionarDelta(hilo(10), null, 3);
    expect(delta.map((m) => m.id)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(nuevoUpto).toBe('7');
  });
  it('con upto → delta = solo lo NO resumido antes de la ventana', () => {
    const { delta, nuevoUpto } = seleccionarDelta(hilo(10), '3', 3);
    expect(delta.map((m) => m.id)).toEqual(['4', '5', '6', '7']);
    expect(nuevoUpto).toBe('7');
  });
  it('upto ya al día (nada nuevo bajo la ventana) → sin delta, conserva upto', () => {
    const { delta, nuevoUpto } = seleccionarDelta(hilo(10), '7', 3);
    expect(delta).toEqual([]);
    expect(nuevoUpto).toBe('7');
  });
  // #4b — watermark inválido (mensaje BORRADO o fuera de la ventana de lectura acotada #4a).
  it('upto BORRADO (id inexistente) → fallback graceful: recomputa desde el inicio, NO rompe, re-ancla', () => {
    const { delta, nuevoUpto } = seleccionarDelta(hilo(10), '999', 3); // '999' no existe
    expect(delta.map((m) => m.id)).toEqual(['1', '2', '3', '4', '5', '6', '7']); // = como sin upto
    expect(nuevoUpto).toBe('7'); // re-ancla a un id VÁLIDO actual (auto-sana el próximo turno)
  });
  it('upto BORRADO y sin overflow → sin delta y NO re-persiste el id muerto (nuevoUpto null)', () => {
    const { delta, nuevoUpto } = seleccionarDelta(hilo(3), '999', 3);
    expect(delta).toEqual([]);
    expect(nuevoUpto).toBeNull();
  });
  it('entradas raras no lanzan', () => {
    expect(seleccionarDelta(null, '1', 3)).toEqual({ delta: [], nuevoUpto: null });
    expect(seleccionarDelta(undefined, null, 3).delta).toEqual([]);
  });
});

function deps(over = {}) {
  return {
    leerMensajes: vi.fn(async () => hilo(10)),
    leerUpto: vi.fn(async () => null),
    leerResumen: vi.fn(async () => ''),
    reservar: vi.fn(async () => ({ allowed: true, reason: 'ok' })),
    reembolsar: vi.fn(async () => {}),
    redactar: vi.fn(async () => 'Resumen nuevo del hilo.'),
    guardar: vi.fn(async () => {}),
    ...over,
  };
}

describe('summarize · mantenerResumen (orquestación)', () => {
  it('overflow → reserva, redacta y GUARDA con el nuevo upto', async () => {
    const d = deps();
    const r = await mantenerResumen(d, { ventana: 3, minDelta: 2 });
    expect(r.via).toBe('resumen');
    expect(d.redactar).toHaveBeenCalledOnce();
    expect(d.guardar).toHaveBeenCalledWith('Resumen nuevo del hilo.', '7');
    expect(d.reembolsar).not.toHaveBeenCalled();
  });

  it('SIN overflow (delta < minDelta) → skip y CERO llamadas de metering/modelo', async () => {
    const d = deps({ leerMensajes: vi.fn(async () => hilo(4)) });
    const r = await mantenerResumen(d, { ventana: 3, minDelta: 2 });
    expect(r.via).toBe('skip');
    expect(r.motivo).toBe('sin_overflow');
    expect(d.reservar).not.toHaveBeenCalled();
    expect(d.redactar).not.toHaveBeenCalled();
  });

  it('reserva NO permitida (kill/cap) → skip SIN llamar al modelo', async () => {
    const d = deps({ reservar: vi.fn(async () => ({ allowed: false, reason: 'kill_switch' })) });
    const r = await mantenerResumen(d, { ventana: 3, minDelta: 2 });
    expect(r.via).toBe('skip');
    expect(r.motivo).toBe('kill_switch');
    expect(d.redactar).not.toHaveBeenCalled();
    expect(d.guardar).not.toHaveBeenCalled();
  });

  it('redacción vacía → reembolsa y NO guarda', async () => {
    const d = deps({ redactar: vi.fn(async () => '  ') });
    const r = await mantenerResumen(d, { ventana: 3, minDelta: 2 });
    expect(r.via).toBe('skip');
    expect(d.reembolsar).toHaveBeenCalledOnce();
    expect(d.guardar).not.toHaveBeenCalled();
  });

  it('Haiku lanza → reembolsa y skip (nunca rompe el turno)', async () => {
    const d = deps({ redactar: vi.fn(async () => { throw new Error('429'); }) });
    const r = await mantenerResumen(d, { ventana: 3, minDelta: 2 });
    expect(r.via).toBe('skip');
    expect(d.reembolsar).toHaveBeenCalledOnce();
  });

  it('deploy-safe: si leerMensajes falla → skip (solo-cola), no lanza', async () => {
    const d = deps({ leerMensajes: vi.fn(async () => { throw new Error('42P01'); }) });
    const r = await mantenerResumen(d, { ventana: 3, minDelta: 2 });
    expect(r.via).toBe('skip');
    expect(r.motivo).toBe('error_lectura');
  });
});
