import { describe, it, expect } from 'vitest';
import { scoreFocos, elegirFoco, construirConsejo, FOCOS } from './consejo.js';

describe('consejo · elegirFoco (determinista)', () => {
  it('usuario nuevo → bienvenida (forzado)', () => {
    expect(elegirFoco({ esNuevo: true })).toBe('bienvenida');
  });
  it('entreno hoy → timing_entreno (mayor peso salvo hito de racha)', () => {
    expect(elegirFoco({ registroHoy: true, entreno_hoy: 'tirada larga' }, [], 1)).toBe('timing_entreno');
  });
  it('hito de racha gana al entreno', () => {
    expect(elegirFoco({ registroHoy: true, entreno_hoy: 'x', hito_racha: true, racha_dias: 7 }, [], 1)).toBe('racha');
  });
  it('excluye focos de los ultimos 14 dias', () => {
    const ctx = { registroHoy: true, entreno_hoy: 'run', despensa: ['avena', 'yogur'] };
    expect(elegirFoco(ctx, ['timing_entreno'], 1)).toBe('favorito_despensa');
  });
  it('sin señales: !registroHoy → sin_registro; registroHoy → progreso', () => {
    expect(elegirFoco({ registroHoy: false }, [], 0)).toBe('sin_registro');
    expect(elegirFoco({ registroHoy: true }, [], 0)).toBe('progreso');
  });
  it('nunca elige un foco de restriccion/peso (el pool no los contiene)', () => {
    for (const f of Object.keys(scoreFocos({ entreno_hoy: 'x', despensa: ['a', 'b'], prot_pendiente: 40, hito_racha: true, racha_dias: 7 }))) {
      expect(FOCOS).toContain(f);
    }
  });
});

describe('consejo · construirConsejo (schema Drucker + slots del motor)', () => {
  it('macro_pendiente rellena cifras reales (ayer/meta) + dato_motor + cta', () => {
    const c = construirConsejo('macro_pendiente', { prot_meta: 140, prot_ayer: 85, prot_pendiente: 55 }, 0);
    expect(c.foco).toBe('macro_pendiente');
    expect(c.cuerpo).toContain('85');
    expect(c.cuerpo).toContain('140');
    expect(c.dato_motor).toEqual({ label: 'Meta de proteína', valor: '140 g' });
    expect(c.cta).toEqual({ label: 'Ver qué cocinar', accion: 'que_puedo_comer' });
  });
  it('sin datos → variante SIN dato + sin dato_motor (nunca deja slots crudos)', () => {
    const c = construirConsejo('macro_pendiente', {}, 0);
    expect(c.cuerpo).not.toMatch(/\{\{/);
    expect(c.dato_motor).toBeUndefined();
  });
  it('racha: dato_motor con dias', () => {
    const c = construirConsejo('racha', { racha_dias: 6 }, 0);
    expect(c.dato_motor).toEqual({ label: 'Racha', valor: '6 días' });
    expect(c.cuerpo).toContain('6');
  });
  it('titulo se trunca a <= 40 chars', () => {
    const c = construirConsejo('favorito_despensa', { ingrediente: 'proteína aislada de suero de leche premium', ingrediente2: 'x' }, 2);
    expect(c.titulo.length).toBeLessThanOrEqual(40);
    expect(c.titulo).not.toMatch(/\{\{/);
  });
  it('el schema es exactamente {foco,titulo,cuerpo,dato_motor?,cta?}', () => {
    const c = construirConsejo('progreso', { adherencia: 80 }, 0);
    expect(Object.keys(c).sort()).toEqual(['cta', 'cuerpo', 'dato_motor', 'foco', 'titulo']);
  });
});

describe('consejo · cinturón de alérgenos', () => {
  it('si el cuerpo nombraría un alérgeno del usuario → cae a variante segura (sin ese alimento)', () => {
    // alérgico al huevo: la variante "ayer" nombra huevo → debe caer a otra segura.
    const c = construirConsejo('macro_pendiente', { prot_meta: 140, prot_ayer: 85, prot_pendiente: 55, restricciones: ['huevo'] }, 0);
    expect(c.cuerpo.toLowerCase()).not.toContain('huevo');
    expect(c.cuerpo.length).toBeGreaterThan(0); // nunca vacío
  });
});

describe('consejo · cinturón de alérgenos en TÍTULO y dato_motor (Slowking MENOR 1)', () => {
  it('favorito_despensa: un alérgeno del usuario NO se nombra en título ni dato_motor', () => {
    // alergia a lácteos + "leche" no-verificada que hubiera llegado a ctx.ingrediente.
    const c = construirConsejo('favorito_despensa', { ingrediente: 'leche', ingrediente2: 'avena', restricciones: ['leche'] }, 2);
    expect(c.titulo.toLowerCase()).not.toContain('leche'); // idx 2 pediría "Aprovecha tu {{ingrediente}}"
    expect(`${c.dato_motor?.valor || ''}`.toLowerCase()).not.toContain('leche');
    expect(c.titulo.length).toBeGreaterThan(0); // nunca vacío
    expect(c.titulo).not.toMatch(/\{\{/); // sin slots crudos al anular el ingrediente
  });
  it('sin restricción, el título SÍ puede nombrar el ingrediente (no sobre-bloquea)', () => {
    const c = construirConsejo('favorito_despensa', { ingrediente: 'avena', ingrediente2: 'yogur' }, 2);
    expect(c.titulo.toLowerCase()).toContain('avena');
  });
});

describe('consejo · guardrails TCA (ninguna plantilla restringe/culpa/pesa)', () => {
  const PROH = ['come menos', 'saltate', 'sáltate', 'quema', 'compensa', 'bajaste', 'subiste', 'te pasaste', 'bascula', 'báscula', 'culpa', 'vas mal'];
  it('el cuerpo renderizado de cada foco no contiene términos prohibidos', () => {
    const ctx = { prot_meta: 140, prot_ayer: 85, prot_pendiente: 55, entreno_hoy: 'tirada larga', km_hoy: 12, despensa: ['avena', 'yogur'], ingrediente: 'avena', ingrediente2: 'yogur', racha_dias: 6, adherencia: 80, agua_ml: 500, agua_meta: 2000, objetivo_label: 'pérdida de grasa', registroHoy: true };
    for (const foco of FOCOS) {
      for (const idx of [0, 1, 2]) {
        const c = construirConsejo(foco, ctx, idx);
        const low = `${c.titulo} ${c.cuerpo}`.toLowerCase();
        for (const p of PROH) expect(low.includes(p), `${foco}[${idx}] contiene "${p}": ${c.cuerpo}`).toBe(false);
      }
    }
  });
});
