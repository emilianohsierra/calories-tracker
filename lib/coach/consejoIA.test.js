import { describe, it, expect, vi } from 'vitest';
import { personalizarConsejo } from './consejoIA.js';

const base = { foco: 'macro_pendiente', titulo: 'Arranca con proteína', cuerpo: 'Te faltan 55 g de proteína para tu meta de 140. Unos frijoles te acercan.', dato_motor: { label: 'Meta de proteína', valor: '140 g' }, cta: { label: 'Ver qué cocinar', accion: 'que_puedo_comer' } };
const okDeps = (over) => ({
  anthropic: {}, esSalud: () => false,
  reservar: async () => ({ allowed: true }), reembolsar: vi.fn(),
  redactar: async () => 'Vas por buen camino: te faltan 55 g de proteína para tu meta de 140; unos frijoles la cierran.',
  juez: async () => ({ peligroso: false }),
  ...over,
});

describe('consejoIA · personalizarConsejo (doble cinturón + fallback)', () => {
  it('sin anthropic → plantilla determinista', async () => {
    const r = await personalizarConsejo({ anthropic: null }, { base });
    expect(r.generado_por).toBe('plantilla');
    expect(r.consejo).toBe(base);
  });
  it('reserva no permitida (kill/cap) → plantilla, sin llamar al modelo', async () => {
    const redactar = vi.fn();
    const r = await personalizarConsejo(okDeps({ reservar: async () => ({ allowed: false, reason: 'kill_switch' }), redactar }), { base });
    expect(r.generado_por).toBe('plantilla');
    expect(redactar).not.toHaveBeenCalled();
  });
  it('IA en carril (cifras intactas, sin TCA, juez ok) → generado_por ia, cuerpo personalizado', async () => {
    const r = await personalizarConsejo(okDeps(), { base });
    expect(r.generado_por).toBe('ia');
    expect(r.consejo.cuerpo).toContain('55');
    expect(r.consejo.cuerpo).toContain('140');
    expect(r.consejo.titulo).toBe(base.titulo); // titulo/dato/cta quedan deterministas
  });
  it('post-check falla (altera una cifra) → plantilla + reembolso', async () => {
    const reembolsar = vi.fn();
    const r = await personalizarConsejo(okDeps({ redactar: async () => 'Te faltan 80 g de proteína para tu meta de 140.', reembolsar }), { base });
    expect(r.generado_por).toBe('plantilla');
    expect(reembolsar).toHaveBeenCalledOnce();
  });
  it('esDatoDeSalud detecta salud en la salida → plantilla + reembolso', async () => {
    const reembolsar = vi.fn();
    const r = await personalizarConsejo(okDeps({ esSalud: () => true, reembolsar }), { base });
    expect(r.generado_por).toBe('plantilla');
    expect(reembolsar).toHaveBeenCalledOnce();
  });
  it('nombra un alérgeno del usuario → plantilla + reembolso', async () => {
    const reembolsar = vi.fn();
    const r = await personalizarConsejo(
      okDeps({ redactar: async () => 'Te faltan 55 g de proteína para tu meta de 140; unos huevos la cierran.', reembolsar }),
      { base, restricciones: ['huevo'] },
    );
    expect(r.generado_por).toBe('plantilla');
    expect(reembolsar).toHaveBeenCalledOnce();
  });
  it('juez PELIGROSO → plantilla + reembolso', async () => {
    const reembolsar = vi.fn();
    const r = await personalizarConsejo(okDeps({ juez: async () => ({ peligroso: true }), reembolsar }), { base });
    expect(r.generado_por).toBe('plantilla');
    expect(reembolsar).toHaveBeenCalledOnce();
  });
  it('FAIL-CLOSED: juez lanza → plantilla + reembolso', async () => {
    const reembolsar = vi.fn();
    const r = await personalizarConsejo(okDeps({ juez: async () => { throw new Error('timeout'); }, reembolsar }), { base });
    expect(r.generado_por).toBe('plantilla');
    expect(reembolsar).toHaveBeenCalledOnce();
  });
});
