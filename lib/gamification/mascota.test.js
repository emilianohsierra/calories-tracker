import { describe, it, expect } from 'vitest';
import { estadoMascota, etapaDeNivel, ANIMOS } from './mascota.js';

const PROHIBIDOS = ['triste', 'llorando', 'enfermo', 'debil', 'moribundo', 'muerto', 'hambriento', 'desnutrido', 'abandonado', 'ansioso', 'enojado', 'decepcionado', 'feliz_por_comer_poco', 'barra_de_vida', 'timer_de_muerte'];

describe('mascota · estados canónicos (Karpathy §2) + resolución por prioridad', () => {
  it('celebración (hito de conducta) → celebrando (transitorio), reaccion celebra', () => {
    const m = estadoMascota({ nivel: 3, celebracion: { tipo: 'logro' }, registroHoy: true });
    expect(m.animo).toBe('celebrando');
    expect(m.reaccion).toBe('celebra');
  });
  it('conducta sana hoy (registró) → contento', () => {
    expect(estadoMascota({ nivel: 2, registroHoy: true }).animo).toBe('contento');
  });
  it('objetivo pendiente → animando; nada → neutro_tranquilo', () => {
    expect(estadoMascota({ nivel: 1, objetivoPendiente: true }).animo).toBe('animando');
    expect(estadoMascota({ nivel: 1 }).animo).toBe('neutro_tranquilo');
  });
  it('racha rota → comprensivo/recuperación (sin culpa)', () => {
    const m = estadoMascota({ nivel: 2, rachaRota: true });
    expect(m.animo).toBe('comprensivo');
    expect(m.submodo).toBe('recuperacion');
    expect(m.mensaje.toLowerCase()).not.toMatch(/culpa|abandon|no me dejes/);
  });
});

describe('mascota · REGLA DURA TCA — under-eating NUNCA feliz', () => {
  it('UNDER_EATING hoy → comprensivo/CUIDADO, NO contento ni celebrando (aunque haya registrado)', () => {
    const m = estadoMascota({ nivel: 3, registroHoy: true, underEating: true });
    expect(m.animo).toBe('comprensivo');
    expect(m.submodo).toBe('cuidado');
    expect(m.animo).not.toBe('contento');
    // el mensaje enmarca AÑADIR, jamás "comiste poco, bien" ni peso
    const low = m.mensaje.toLowerCase();
    expect(low).toMatch(/suficiente|suma|agrega|rico/);
    expect(low).not.toMatch(/peso|bascula|bajaste|poquito|bien comiste poco/);
  });
  it('under-eating tiene PRIORIDAD 80 sobre contento (60): la nutrición no la sube a contento', () => {
    expect(estadoMascota({ nivel: 2, registroHoy: true, proteinaEnMeta: true, underEating: true }).animo).toBe('comprensivo');
  });
  it('celebrando (hito de registro) puede convivir con under-eating (celebra el LOGRO, no la comida) pero el reposo es cuidado', () => {
    const m = estadoMascota({ nivel: 4, celebracion: { tipo: 'racha_hito' }, underEating: true });
    expect(m.animo).toBe('celebrando'); // transitorio: el logro/racha de REGISTRO
    expect(m.reposo).toBe('comprensivo'); // el mood de fondo sigue siendo cuidado
    expect(m.mensaje.toLowerCase()).not.toMatch(/peso|comiste poco/);
  });
});

describe('mascota · estados PROHIBIDOS imposibles por diseño (§3)', () => {
  it('animo SIEMPRE ∈ los 6 permitidos, jamás un prohibido, para cualquier input', () => {
    const inputs = [
      {}, { celebracion: {} }, { underEating: true }, { rachaRota: true }, { registroHoy: true },
      { objetivoPendiente: true }, { durmiendo: true }, { underEating: true, celebracion: {}, rachaRota: true, registroHoy: true },
      { nivel: -5 }, { nivel: 99 },
    ];
    for (const i of inputs) {
      const m = estadoMascota(i);
      expect(ANIMOS).toContain(m.animo);
      expect(PROHIBIDOS).not.toContain(m.animo);
    }
  });
});

describe('mascota · evolución por nivel (solo hacia adelante, nunca por peso)', () => {
  it('etapaDeNivel es monótona: sube con el nivel, nunca decrece', () => {
    expect(etapaDeNivel(1).etapa).toBe('bebe');
    expect(etapaDeNivel(3).etapa).toBe('activo');
    expect(etapaDeNivel(5).etapa).toBe('maestro');
    expect(etapaDeNivel(99).etapa).toBe('maestro'); // tope, no rompe
    expect(etapaDeNivel(0).etapa).toBe('bebe'); // piso
  });
});
