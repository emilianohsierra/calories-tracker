import { describe, it, expect } from 'vitest';
import { computeDataQuality } from './quality.js';

const nutComplete = { kcal: 100, prot: 5, carb: 10, gras: 2 };

describe('pantry/quality · computeDataQuality (completitud → score + level)', () => {
  it('OFF verificado completo con barcode+imagen+marca → verified (score 0.9)', () => {
    const r = computeDataQuality({ codigo: '7501055310333', image_url: 'http://x/i.jpg', marca: 'McCormick', nutricion: nutComplete, confianza: 'verified' });
    expect(r.score).toBe(0.9); // .2+.15+.25+.1+.2
    expect(r.level).toBe('verified');
  });
  it('producto de usuario con imagen+marca+nutrición → community (score 0.8)', () => {
    const r = computeDataQuality({ codigo: 'x', image_url: 'http://x', marca: 'Casera', nutricion: nutComplete, confianza: 'user', is_user_created: true });
    expect(r.score).toBe(0.8);
    expect(r.level).toBe('community');
  });
  it('estimado por IA, solo nutrición → estimated (score bajo)', () => {
    const r = computeDataQuality({ nutricion: nutComplete, confianza: 'ai' });
    expect(r.score).toBe(0.3); // .25 nutrición + .05 fuente estimada
    expect(r.level).toBe('estimated');
  });
  it('faltan macros esenciales → incomplete (nunca se presenta como exacto)', () => {
    const r = computeDataQuality({ codigo: 'x', image_url: 'h', marca: 'Z', nutricion: { kcal: 100 }, confianza: 'verified' });
    expect(r.level).toBe('incomplete');
  });
  it('vacío → incomplete, score 0', () => {
    const r = computeDataQuality({});
    expect(r.score).toBe(0);
    expect(r.level).toBe('incomplete');
  });
});
