import { describe, it, expect } from 'vitest';
import { sustituir, esMejor } from './sustituciones.js';

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

describe('sustituir · esMejor (menos sellos gana; a igualdad, mejor nutri)', () => {
  it('menos sellos de EXCESO', () => {
    expect(esMejor(agua, target)).toBe(true);
    expect(esMejor(peor, target)).toBe(false);
  });
  it('sin target → cualquier candidato seguro sirve', () => {
    expect(esMejor(agua, null)).toBe(true);
  });
});
