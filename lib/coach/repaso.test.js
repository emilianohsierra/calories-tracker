import { describe, it, expect } from 'vitest';
import {
  programarRepaso, dominioDe, elegirForma, construirItemRepaso, seleccionarDue,
  SRS, CATALOGO, TEMAS_REPASO, sumarDias,
} from './repaso.js';

const HOY = '2026-08-14';

describe('repaso · programarRepaso (SM-2 determinista)', () => {
  it('acierto en día distinto: sube rung y ease, avanza next_review por la escalera', () => {
    const p = programarRepaso({ rung: 0, intervalo: 1, ease_factor: 2.3, aciertos_consecutivos: 1, ultimo_visto: '2026-08-13' }, { correcto: true }, HOY);
    expect(p.rung).toBe(1);
    expect(p.intervalo).toBe(SRS.LADDER[1]); // 3
    expect(p.ease_factor).toBe(2.4); // +0.1
    expect(p.aciertos_consecutivos).toBe(2);
    expect(p.next_review).toBe(sumarDias(HOY, 3));
    expect(p.reensena).toBe(false);
  });
  it('escalera de aciertos desde una fila sembrada (rung0/1d): 3→7→14→30→(tope 60)', () => {
    // día 1 = siembra (rung 0, intervalo 1); los aciertos de repaso avanzan la escalera.
    const esperados = [3, 7, 14, 30, 60];
    let prev = { rung: 0, intervalo: 1, ease_factor: 2.3, aciertos_consecutivos: 0, ultimo_visto: '2000-01-01' };
    for (let i = 0; i < 5; i++) {
      const p = programarRepaso(prev, { correcto: true }, HOY);
      expect(p.intervalo).toBe(esperados[i]);
      prev = { ...p, ultimo_visto: '2000-01-01' }; // forzar día distinto siempre
    }
  });
  it('más allá de rung 4: intervalo = round(intervalo × ease) con tope 60', () => {
    const p = programarRepaso({ rung: 4, intervalo: 30, ease_factor: 2.3, aciertos_consecutivos: 3, ultimo_visto: '2000-01-01' }, { correcto: true }, HOY);
    expect(p.rung).toBe(5);
    expect(p.intervalo).toBe(60); // round(30 × 2.4)=72 → tope 60
  });
  it('FALLO: reinicia a rung 0 (1 día), baja ease, resetea racha, reensena=true', () => {
    const p = programarRepaso({ rung: 4, intervalo: 30, ease_factor: 2.3, aciertos_consecutivos: 3, ultimo_visto: '2000-01-01' }, { correcto: false }, HOY);
    expect(p.rung).toBe(0);
    expect(p.intervalo).toBe(1);
    expect(p.ease_factor).toBe(2.1); // -0.2
    expect(p.aciertos_consecutivos).toBe(0);
    expect(p.reensena).toBe(true);
    expect(p.estado).toBe('aprendiendo');
    expect(p.next_review).toBe(sumarDias(HOY, 1));
  });
  it('ease respeta el rango [1.6, 2.8]', () => {
    const bajo = programarRepaso({ ease_factor: 1.7, rung: 0, intervalo: 1, ultimo_visto: '2000-01-01' }, { correcto: false }, HOY);
    expect(bajo.ease_factor).toBe(1.6); // 1.7-0.2=1.5 → piso 1.6
    let alto = { ease_factor: 2.75, rung: 0, intervalo: 1, aciertos_consecutivos: 0, ultimo_visto: '2000-01-01' };
    alto = programarRepaso(alto, { correcto: true }, HOY);
    expect(alto.ease_factor).toBe(2.8); // 2.75+0.1=2.85 → tope 2.8
  });
  it('anti-spam: acierto el MISMO día no avanza rung ni racha (consolida)', () => {
    const p = programarRepaso({ rung: 2, intervalo: 7, ease_factor: 2.3, aciertos_consecutivos: 2, ultimo_visto: HOY }, { correcto: true }, HOY);
    expect(p.rung).toBe(2);
    expect(p.aciertos_consecutivos).toBe(2);
    expect(p.ease_factor).toBe(2.3);
  });
  it('acierto CON PISTA/duda consolida sin premiar (mantiene rung)', () => {
    const p = programarRepaso({ rung: 2, intervalo: 7, ease_factor: 2.3, aciertos_consecutivos: 2, ultimo_visto: '2000-01-01' }, { correcto: true, conPista: true }, HOY);
    expect(p.rung).toBe(2);
    expect(p.aciertos_consecutivos).toBe(2);
    expect(p.ease_factor).toBe(2.3);
  });
});

describe('repaso · dominioDe (conservador)', () => {
  it('NO domina por <3 aciertos ni por rung <3', () => {
    expect(dominioDe(4, 2)).toBe('aprendiendo'); // aciertos insuficientes
    expect(dominioDe(2, 5)).toBe('aprendiendo'); // rung insuficiente
  });
  it('dominado = ≥3 aciertos consecutivos Y rung ≥3', () => {
    expect(dominioDe(3, 3)).toBe('dominado');
  });
  it('1 fallo estando dominado → aprendiendo (rung 0, racha 0)', () => {
    const p = programarRepaso({ rung: 3, intervalo: 14, ease_factor: 2.3, aciertos_consecutivos: 3, ultimo_visto: '2000-01-01' }, { correcto: false }, HOY);
    expect(p.estado).toBe('aprendiendo');
  });
});

describe('repaso · catálogo + ítems (contenido reusado, TCA-safe)', () => {
  it('cada tema tiene ≥2 formas y opciones con la correcta rechazando el mito', () => {
    for (const tema of TEMAS_REPASO) {
      expect(CATALOGO[tema].formas.length).toBeGreaterThanOrEqual(2);
      for (const f of CATALOGO[tema].formas) {
        expect(f.opciones.length).toBe(3);
        expect(f.opciones[f.correcta]).toBeTruthy();
      }
    }
  });
  it('construirItemRepaso rellena el contexto con cifras del motor', () => {
    const forma = CATALOGO.proteina.formas[0];
    const it = construirItemRepaso('proteina', forma, { prot_consumida: 40, prot_meta: 120 });
    expect(it.contexto).toContain('40');
    expect(it.contexto).toContain('120');
    expect(it.pregunta).toBe(forma.pregunta);
  });
  it('si falta un slot del motor → OMITE el contexto (queda la pregunta conceptual)', () => {
    const it = construirItemRepaso('proteina', CATALOGO.proteina.formas[0], { prot_consumida: null, prot_meta: null });
    expect(it.contexto).toBeNull();
    expect(it.pregunta).toBeTruthy();
  });
  it('ningún ítem afirma un mito ni demoniza alimentos (marco añadir-no-restringir)', () => {
    const PROH = ['come menos', 'saltate', 'sáltate', 'prohibido', 'veneno', 'engorda', 'quema grasa', 'bascula', 'báscula'];
    for (const tema of TEMAS_REPASO) {
      for (const f of CATALOGO[tema].formas) {
        const low = `${f.pregunta} ${f.feedback_ok} ${f.feedback_no}`.toLowerCase();
        for (const p of PROH) expect(low.includes(p), `${tema}/${f.id} contiene "${p}"`).toBe(false);
      }
    }
  });
});

describe('repaso · elegirForma (rota para variar la re-enseñanza)', () => {
  it('evita la última forma mostrada cuando hay >1', () => {
    const f = elegirForma('proteina', 0, 'v1');
    expect(f.id).not.toBe('v1');
  });
  it('tema inexistente → null', () => {
    expect(elegirForma('no_existe', 0, null)).toBeNull();
  });
});

describe('repaso · seleccionarDue (prioridad determinista)', () => {
  it('elige el tema DUE más vencido y cuenta pendientes', () => {
    const rows = [
      { concepto: 'proteina', next_review: '2026-08-13', errores: 0, ease_factor: 2.3 }, // 1 día
      { concepto: 'deficit', next_review: '2026-08-10', errores: 1, ease_factor: 2.3 },   // 4 días (más vencido)
      { concepto: 'calidad_sin_culpa', next_review: '2026-08-20', errores: 0, ease_factor: 2.3 }, // futuro, no due
    ];
    const sel = seleccionarDue(rows, HOY);
    expect(sel.concepto).toBe('deficit');
    expect(sel.pendientes).toBe(2);
    expect(sel.atrasado_dias).toBe(4);
  });
  it('sin due → null; ignora temas fuera del curriculum (huérfanos)', () => {
    expect(seleccionarDue([{ concepto: 'proteina', next_review: '2026-09-01' }], HOY)).toBeNull();
    expect(seleccionarDue([{ concepto: 'tema_muerto', next_review: '2026-08-01' }], HOY, ['proteina'])).toBeNull();
  });
});
