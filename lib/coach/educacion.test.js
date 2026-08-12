import { describe, it, expect, vi } from 'vitest';
import {
  intentEducativo, debeOfrecerLeccion, trasOferta, datosDe,
  explicacionBase, explicarConcepto, patchQuiz,
} from './educacion.js';
import { explicacionDe, leccionDe } from './curriculum.js';

describe('educacion · gate de intención (anti-saturación)', () => {
  it('factual → directo', () => {
    expect(intentEducativo('¿cuántas kcal tiene esto?')).toBe('factual');
    expect(intentEducativo('¿cuál es mi meta?')).toBe('factual');
  });
  it('por-qué → educar', () => {
    expect(intentEducativo('¿por qué necesito déficit?')).toBe('porque');
    expect(intentEducativo('para qué sirve la proteína')).toBe('porque');
  });
  it('el por-qué gana al factual en frases mixtas', () => {
    expect(intentEducativo('¿por qué son tantas kcal?')).toBe('porque');
  });
  it('normal → sin educación', () => {
    expect(intentEducativo('anota leche')).toBe('normal');
  });
});

describe('educacion · back-off de ofertas', () => {
  it('deja de ofrecer tras 2 ignoradas', () => {
    expect(debeOfrecerLeccion(0)).toBe(true);
    expect(debeOfrecerLeccion(1)).toBe(true);
    expect(debeOfrecerLeccion(2)).toBe(false);
  });
  it('aceptar resetea; ignorar incrementa', () => {
    expect(trasOferta(1, true)).toBe(0);
    expect(trasOferta(1, false)).toBe(2);
  });
});

describe('educacion · datos reales + base determinista', () => {
  it('proteina: inyecta el pendiente del motor', () => {
    const ctx = { targets: { protein_g: 120 }, today: { prot: 60, pendientes: {} } };
    expect(datosDe('proteina', ctx)).toContain('60');
    expect(datosDe('proteina', ctx)).toContain('120');
  });
  it('base cae a la variante del nivel + datos', () => {
    const ctx = { targets: { protein_g: 120 }, today: { prot: 60, pendientes: {} } };
    const b = explicacionBase('proteina', 'principiante', ctx);
    expect(b.texto).toContain(explicacionDe('proteina', 'principiante').texto);
    expect(b.nivel).toBe('principiante');
  });
});

describe('educacion · explicarConcepto (base segura + IA opcional con post-check)', () => {
  const ctx = { targets: { protein_g: 120 }, today: { prot: 60, pendientes: {} } };

  it('sin IA → base determinista', async () => {
    const r = await explicarConcepto({ anthropic: null }, { concepto: 'deficit', nivel: 'basico', ctx });
    expect(r.via).toBe('determinista');
  });

  it('IA en carril → usa la personalización', async () => {
    const base = explicacionBase('proteina', 'basico', ctx);
    const r = await explicarConcepto({
      anthropic: {}, reservar: async () => ({ allowed: true }), reembolsar: vi.fn(),
      redactar: async () => base.texto, // conserva cifras y sin términos prohibidos
    }, { concepto: 'proteina', nivel: 'basico', ctx });
    expect(r.via).toBe('ia');
  });

  it('B.5: vocabulario educativo NEUTRO (bajar de peso / grasa corporal) con cifras → IA (ya NO se sobre-filtra)', async () => {
    const r = await explicarConcepto({
      anthropic: {}, reservar: async () => ({ allowed: true }), reembolsar: vi.fn(),
      redactar: async () => 'La proteína protege tu músculo mientras bajas de peso y reduces grasa corporal. Hoy llevas 60 de 120 g; te faltan 60 g.',
    }, { concepto: 'proteina', nivel: 'basico', ctx });
    expect(r.via).toBe('ia'); // 'bajar de peso'/'grasa corporal' son legítimos; cifras intactas
  });

  it('B.5: TCA real ("deja de comer") → post-check descarta → base + reembolso', async () => {
    const reembolsar = vi.fn();
    const r = await explicarConcepto({
      anthropic: {}, reservar: async () => ({ allowed: true }), reembolsar,
      redactar: async () => 'Para lograrlo, deja de comer en la cena. Hoy llevas 60 de 120 g; te faltan 60 g.',
    }, { concepto: 'proteina', nivel: 'basico', ctx });
    expect(r.via).toBe('determinista');
    expect(reembolsar).toHaveBeenCalledOnce();
  });

  it('reserva no permitida (kill/cap) → base sin llamar al modelo', async () => {
    const redactar = vi.fn();
    const r = await explicarConcepto({
      anthropic: {}, reservar: async () => ({ allowed: false, reason: 'kill_switch' }), reembolsar: vi.fn(), redactar,
    }, { concepto: 'deficit', nivel: 'basico', ctx });
    expect(r.via).toBe('determinista');
    expect(redactar).not.toHaveBeenCalled();
  });
});

describe('educacion · explicarConcepto + JUEZ (2ª etapa, fail-closed)', () => {
  const ctx = { targets: { protein_g: 120 }, today: { prot: 60, pendientes: {} } };
  const okDeps = (over) => ({
    anthropic: {}, reservar: async () => ({ allowed: true }), reembolsar: vi.fn(),
    redactar: async () => 'La proteína protege tu músculo mientras bajas de peso. Hoy llevas 60 de 120 g; te faltan 60 g.',
    ...over,
  });

  it('el PRE-FILTRO bloquea ANTES del juez (juez NO se llama, 0 costo extra)', async () => {
    const juez = vi.fn();
    const reembolsar = vi.fn();
    const r = await explicarConcepto(okDeps({
      redactar: async () => 'Para lograrlo, deja de comer en la cena. 60 de 120 g.',
      juez, reembolsar,
    }), { concepto: 'proteina', nivel: 'basico', ctx });
    expect(r.via).toBe('determinista');
    expect(juez).not.toHaveBeenCalled();
    expect(reembolsar).toHaveBeenCalledOnce();
  });

  it('pre-filtro pasa + juez PELIGROSO → fallback + reembolso', async () => {
    const reembolsar = vi.fn();
    const r = await explicarConcepto(okDeps({ juez: async () => ({ peligroso: true, categoria: 'perifrasis' }), reembolsar }),
      { concepto: 'proteina', nivel: 'basico', ctx });
    expect(r.via).toBe('determinista');
    expect(reembolsar).toHaveBeenCalledOnce();
  });

  it('pre-filtro pasa + juez SEGURO (peligroso:false) → IA', async () => {
    const r = await explicarConcepto(okDeps({ juez: async () => ({ peligroso: false }) }),
      { concepto: 'proteina', nivel: 'basico', ctx });
    expect(r.via).toBe('ia');
  });

  it('FAIL-CLOSED: juez LANZA (error/timeout) → fallback + reembolso', async () => {
    const reembolsar = vi.fn();
    const r = await explicarConcepto(okDeps({ juez: async () => { throw new Error('timeout'); }, reembolsar }),
      { concepto: 'proteina', nivel: 'basico', ctx });
    expect(r.via).toBe('determinista');
    expect(reembolsar).toHaveBeenCalledOnce();
  });

  it('FAIL-CLOSED: juez devuelve algo sin booleano válido → fallback', async () => {
    const r = await explicarConcepto(okDeps({ juez: async () => null }), { concepto: 'proteina', nivel: 'basico', ctx });
    expect(r.via).toBe('determinista');
    const r2 = await explicarConcepto(okDeps({ juez: async () => ({ categoria: 'x' }) }), { concepto: 'proteina', nivel: 'basico', ctx });
    expect(r2.via).toBe('determinista');
  });

  it('protección de cifras corre en el pre-filtro (juez no se llega a llamar si la cifra se altera)', async () => {
    const juez = vi.fn(async () => ({ peligroso: false }));
    const r = await explicarConcepto(okDeps({
      redactar: async () => 'Vas 60 de 100 g; te faltan 60 g.', // 120 → 100
      juez,
    }), { concepto: 'proteina', nivel: 'basico', ctx });
    expect(r.via).toBe('determinista');
    expect(juez).not.toHaveBeenCalled();
  });
});

describe('educacion · patchQuiz (no domina por 1 acierto)', () => {
  it('acumula aciertos/errores y mantiene estado visto (SRS = fase 2)', () => {
    expect(patchQuiz({ aciertos: 1, errores: 0 }, true)).toEqual({ estado: 'visto', aciertos: 2, errores: 0 });
    expect(patchQuiz(null, false)).toEqual({ estado: 'visto', aciertos: 0, errores: 1 });
  });
  it('leccionDe devuelve contenido con quiz', () => {
    expect(leccionDe('deficit').quiz.correcta).toBe(1);
  });
});
