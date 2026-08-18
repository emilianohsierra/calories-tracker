import { describe, it, expect } from 'vitest';
import { sustituir, esMejor, esMejorPorObjetivo } from './sustituciones.js';

const target = { product_id: 't', nombre: 'Refresco', nutri_score: 'e', sellos: { activos: ['azucares', 'calorias'] }, confianza: 'verified', allergens: [], ingredientes: ['agua', 'jarabe de maiz'] };
const agua = { product_id: 'a', nombre: 'Agua mineral', nutri_score: 'a', sellos: { activos: [] }, confianza: 'verified', allergens: [], ingredientes: ['agua'], disponible: true };
const malteada = { product_id: 'l', nombre: 'Malteada', nutri_score: 'b', sellos: { activos: [] }, confianza: 'verified', allergens: ['milk'], ingredientes: ['leche'] };
const peor = { product_id: 'r', nombre: 'Otro refresco', nutri_score: 'e', sellos: { activos: ['azucares', 'calorias', 'sodio'] }, confianza: 'verified', allergens: [], ingredientes: ['agua', 'jarabe'] };

describe('sustituir · seguridad (NUNCA un alérgeno declarado) + grounded', () => {
  it('sugiere la alternativa mejor y SEGURA; excluye la que tiene alérgeno declarado y la peor', () => {
    const out = sustituir({ target, candidatos: [agua, malteada, peor], restricciones: ['leche'], opts: { max: 3 } });
    const nombres = out.map((o) => o.nombre);
    expect(nombres).toContain('Agua mineral');
    expect(nombres).not.toContain('Malteada'); // lácteo declarado → NUNCA
    expect(nombres).not.toContain('Otro refresco'); // no mejora (más sellos)
    expect(out[0].razon).toMatch(/sin|despensa|nutri/); // razón grounded
  });

  it('sin alternativa mejor+segura → [] (honesto, no inventa)', () => {
    expect(sustituir({ target, candidatos: [malteada, peor], restricciones: ['leche'] })).toEqual([]);
  });

  it('un candidato con alérgeno NO verificado (nombre evidente) también se excluye', () => {
    const cremaMani = { product_id: 'm', nombre: 'Crema de cacahuate', nutri_score: 'a', sellos: { activos: [] }, confianza: 'user', ingredientes: [] };
    const out = sustituir({ target, candidatos: [cremaMani], restricciones: ['cacahuate'] });
    expect(out).toEqual([]); // belt de nombre/lexico → fuera
  });
});

describe('sustituir · contrato de la FICHA (#3, lo que consume Rams)', () => {
  it('cada resultado trae {product_id, nombre, nutri_score, sellos[], disponible, razon}', () => {
    const out = sustituir({ target, candidatos: [agua], restricciones: [] });
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0]).sort()).toEqual(['disponible', 'nombre', 'nutri_score', 'product_id', 'razon', 'sellos']);
    expect(Array.isArray(out[0].sellos)).toBe(true); // sellos = array de activos (no el objeto)
    expect(typeof out[0].disponible).toBe('boolean');
    expect(typeof out[0].razon).toBe('string');
  });
  it('ranking: disponible (en despensa) primero, luego menos sellos / mejor nutri', () => {
    const aguaCatalogo = { ...agua, product_id: 'a2', nombre: 'Agua catálogo', disponible: false };
    const aguaDespensa = { ...agua, product_id: 'a1', nombre: 'Agua despensa', disponible: true };
    const out = sustituir({ target, candidatos: [aguaCatalogo, aguaDespensa], restricciones: [] });
    expect(out[0].nombre).toBe('Agua despensa'); // disponible gana el desempate
    expect(out[0].disponible).toBe(true);
  });
});

describe('sustituir · B mejor POR OBJETIVO (Karpathy §B)', () => {
  // per-100: yogur griego (alto prot) vs yogur bebible azucarado (bajo prot, 1 sello)
  const bebible = { product_id: 'yb', nombre: 'Yogur bebible', nutri_score: 'c', sellos: { activos: ['azucares'] }, confianza: 'verified', allergens: [], ingredientes: ['leche'], nutricion: { calories: 75, protein_g: 4, carbs_g: 12, fiber_g: 0 } };
  const griego = { product_id: 'yg', nombre: 'Yogur griego', nutri_score: 'a', sellos: { activos: [] }, confianza: 'verified', allergens: [], ingredientes: ['leche'], nutricion: { calories: 90, protein_g: 15, carbs_g: 6, fiber_g: 0 }, disponible: true };

  it('hipertrofia: griego (más proteína, menos sellos) CALIFICA sobre bebible; razón menciona proteína', () => {
    expect(esMejorPorObjetivo(griego, bebible, 'hipertrofia')).toBe(true);
    const out = sustituir({ target: bebible, candidatos: [griego], restricciones: [], objetivo: 'hipertrofia' });
    expect(out[0].nombre).toBe('Yogur griego');
    expect(out[0].razon.toLowerCase()).toMatch(/proteina|proteína/);
  });
  it('PISO DE SEGURIDAD: un candidato con MÁS sellos NO califica aunque tenga más proteína', () => {
    const altoProtMasSellos = { ...griego, product_id: 'x', nombre: 'Barra proteica', sellos: { activos: ['azucares', 'grasas_saturadas'] }, nutricion: { calories: 200, protein_g: 20, carbs_g: 20, fiber_g: 1 } };
    expect(esMejorPorObjetivo(altoProtMasSellos, bebible, 'hipertrofia')).toBe(false); // más sellos → nunca
  });
  it('FALLBACK sin datos per-100 → usa esMejor (menos sellos)', () => {
    const sinNut = { product_id: 'a', nombre: 'Agua', nutri_score: 'a', sellos: { activos: [] }, confianza: 'verified', allergens: [], ingredientes: ['agua'] };
    const tgtSellos = { nombre: 'Refresco', nutri_score: 'e', sellos: { activos: ['azucares', 'calorias'] } };
    expect(esMejorPorObjetivo(sinNut, tgtSellos, 'hipertrofia')).toBe(true); // cae a esMejor (menos sellos)
  });
  it('runner: rankea por más carbohidrato (a igualdad de seguridad)', () => {
    const arroz = { product_id: 'r', nombre: 'Arroz', nutri_score: 'a', sellos: { activos: [] }, confianza: 'verified', ingredientes: ['arroz'], nutricion: { calories: 130, protein_g: 3, carbs_g: 28, fiber_g: 0 } };
    const pollo = { product_id: 'p', nombre: 'Pollo', nutri_score: 'a', sellos: { activos: [] }, confianza: 'verified', ingredientes: ['pollo'], nutricion: { calories: 165, protein_g: 31, carbs_g: 0, fiber_g: 0 } };
    const tgt = { nombre: 'Galleta', sellos: { activos: [] }, nutricion: { calories: 450, protein_g: 6, carbs_g: 20, fiber_g: 1 } };
    const out = sustituir({ target: tgt, candidatos: [pollo, arroz], restricciones: [], objetivo: 'runner' });
    expect(out[0].nombre).toBe('Arroz'); // más carbo que pollo
  });
  it('alérgeno declarado NUNCA aparece aunque sea "mejor por objetivo"', () => {
    const griegoAlergeno = { ...griego, nombre: 'Yogur griego', ingredientes: ['leche'], allergens: ['lacteo'] };
    const out = sustituir({ target: bebible, candidatos: [griegoAlergeno], restricciones: ['leche'], objetivo: 'hipertrofia' });
    expect(out).toEqual([]); // lácteo declarado → fuera, sin importar la meta
  });
  it('retrocompatible: sin objetivo → comportamiento actual (esMejor)', () => {
    const out = sustituir({ target: bebible, candidatos: [griego], restricciones: [] });
    expect(out[0].nombre).toBe('Yogur griego'); // menos sellos gana igual
  });
});

describe('sustituir · esMejor (menos sellos gana; a igualdad, mejor nutri)', () => {
  it('menos sellos de EXCESO', () => {
    expect(esMejor(agua, target)).toBe(true);
    expect(esMejor(peor, target)).toBe(false);
  });
  it('sin target → cualquier candidato seguro sirve', () => {
    expect(esMejor(agua, null)).toBe(true);
  });
});
