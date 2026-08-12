import { describe, it, expect } from 'vitest';
import { verificarEducacionIA } from './verificarEducacionIA.js';

// base determinista de referencia (con cifras reales del motor).
const BASE = 'La proteína protege tu músculo. Hoy llevas 60 de 120 g; te faltan 60 g.';

describe('verificarEducacionIA · PERMITE vocabulario educativo neutro (los 9 que antes se bloqueaban)', () => {
  // Cada frase conserva las cifras de la base (60/120) para aislar el léxico.
  const legit = [
    'Un déficit calórico te ayuda a bajar de peso de forma sostenible; llevas 60 de 120 g.',
    'La grasa corporal baja cuando mantienes un déficit; vas 60 de 120 g de proteína.',
    'El IMC es una referencia general; prioriza proteína: 60 de 120 g hoy.',
    'En déficit conservas masa muscular con proteína alta; 60 de 120 g.',
    'Adelgazar de forma saludable es comer un poco menos; llevas 60 de 120 g.',
    'Para perder grasa preserva músculo con proteína; 60 de 120 g.',
    'Tu composición corporal mejora con proteína y fuerza; 60 de 120 g.',
    'Las calorías miden energía; tus metas ya las calcula el motor; 60 de 120 g.',
    'Subir de peso en músculo requiere superávit y proteína; 60 de 120 g.',
  ];
  it('todas pasan (marco neutro-saludable, cifras intactas)', () => {
    for (const f of legit) {
      const r = verificarEducacionIA(f, BASE);
      expect(r.ok, `debería PASAR: "${f}" (motivo=${r.motivo})`).toBe(true);
    }
  });
});

describe('verificarEducacionIA · BLOQUEA TCA real', () => {
  // Conservan las cifras para aislar el bloqueo por léxico (no por cifra).
  const tca = [
    'Para lograrlo, deja de comer en la cena; 60 de 120 g.',       // deja de comer
    'Prueba un ayuno prolongado de varios días; 60 de 120 g.',      // ayuno peligroso
    'Si te pasas, vomita lo que comiste; 60 de 120 g.',            // purga
    'Castígate con doble cardio por comer; 60 de 120 g.',          // castigo/compensación
    'Puedes bajar 10 kilos en una semana; 60 de 120 g.',           // pérdida peligrosamente rápida
    'La meta es cero carbohidratos siempre; 60 de 120 g.',         // cero-macro como meta
    'El pan es un alimento malo y prohibido; 60 de 120 g.',        // demonización
    'Muérete de hambre para adelgazar; 60 de 120 g.',              // pasar hambre extremo
  ];
  it('todas se descartan', () => {
    for (const f of tca) {
      const r = verificarEducacionIA(f, BASE);
      expect(r.ok, `debería BLOQUEAR: "${f}" (motivo=${r.motivo})`).toBe(false);
    }
  });
});

describe('verificarEducacionIA · protección de cifras (base ⊆ reescritura)', () => {
  it('altera una cifra real del usuario → descarta', () => {
    expect(verificarEducacionIA('Vas 60 de 100 g; te faltan 60 g.', BASE).ok).toBe(false); // 120→100
  });
  it('conserva las cifras reales y agrega una ILUSTRATIVA genérica → pasa', () => {
    const r = verificarEducacionIA('Vas 60 de 120 g; unas 2 latas de atún (~40 g) te acercan.', BASE);
    expect(r.ok).toBe(true); // 60 y 120 presentes; 2 y 40 son ilustrativas permitidas
  });
  it('vacío o larguísimo → descarta', () => {
    expect(verificarEducacionIA('', BASE).ok).toBe(false);
    expect(verificarEducacionIA('x'.repeat(700), 'sin cifras').ok).toBe(false);
  });
});

describe('verificarEducacionIA · no sobre-filtra falsos positivos morfológicos', () => {
  it('"el cuerpo compensa el déficit" NO se bloquea (compens no es stem TCA)', () => {
    expect(verificarEducacionIA('El cuerpo compensa parte del déficit adaptándose.', 'sin cifras').ok).toBe(true);
  });
  it('"date una recompensa saludable" NO se bloquea', () => {
    expect(verificarEducacionIA('Date una recompensa saludable de vez en cuando.', 'sin cifras').ok).toBe(true);
  });
});
