import { describe, it, expect } from 'vitest';
import { sellosNOM051, inferirLiquido, anadidosDeIngredientes } from './nom051.js';

// Ingredientes de apoyo para los tests con añadidos.
const CON_AZUCAR = ['Agua', 'Jarabe de maíz de alta fructosa', 'Color caramelo'];
const CON_SAL = ['Harina de trigo', 'Sal'];
const CON_ACEITE = ['Harina', 'Aceite vegetal'];

describe('nom051 · sellosNOM051 (umbrales oficiales, cero invención)', () => {
  it('refresco (líquido) con jarabe de alta fructosa + azúcar alta → AZÚCARES + CALORÍAS', () => {
    const r = sellosNOM051({ kcal: 80, azucar: 18, grasa_sat: 0, grasa_trans: 0, sodio_mg: 10 }, { tipo: 'liquido', ingredientes: CON_AZUCAR });
    expect(r.activos).toEqual(expect.arrayContaining(['calorias', 'azucares']));
    expect(r.azucares).toBe('exceso');
    expect(r.disclaimer).toMatch(/NOM-051/);
  });

  it('producto SIN nutrición → todos indeterminados', () => {
    const r = sellosNOM051(null, {});
    expect(r.activos).toEqual([]);
    expect(r.calorias).toBe('indeterminado');
  });

  it('sodio BORDE 300 (sólido, kcal alta para aislar la regla, con SAL añadida)', () => {
    expect(sellosNOM051({ kcal: 400, sodio_mg: 300 }, { tipo: 'solido', ingredientes: CON_SAL }).sodio).toBe('exceso');
    expect(sellosNOM051({ kcal: 400, sodio_mg: 299 }, { tipo: 'solido', ingredientes: CON_SAL }).sodio).toBe('no');
  });

  it('LÍQUIDO vs SÓLIDO: energía 100 → líquido excede calorías, sólido no (calorías sin gate)', () => {
    expect(sellosNOM051({ kcal: 100 }, { tipo: 'liquido' }).calorias).toBe('exceso');
    expect(sellosNOM051({ kcal: 100 }, { tipo: 'solido' }).calorias).toBe('no');
  });

  it('energía 0: calorías "no"; sodio sólido kcal0 usa solo regla 300', () => {
    const r0 = sellosNOM051({ kcal: 0, azucar: 0, sodio_mg: 200 }, { tipo: 'solido', ingredientes: CON_SAL });
    expect(r0.calorias).toBe('no');
    expect(r0.sodio).toBe('no'); // 200<300 y 1mg/kcal no aplica a kcal 0
    expect(sellosNOM051({ kcal: 0, sodio_mg: 350 }, { tipo: 'solido', ingredientes: CON_SAL }).sodio).toBe('exceso');
  });

  it('bebida SIN calorías → sodio OMITIDO (borde 45 mg/100 mL pendiente DOF)', () => {
    const r = sellosNOM051({ kcal: 0, sodio_mg: 50 }, { tipo: 'liquido', ingredientes: CON_SAL });
    expect(r.sodio).toBe('indeterminado');
    expect(r.activos).not.toContain('sodio');
  });

  it('excepción oficial → sin sellos', () => {
    expect(sellosNOM051({ kcal: 900, grasa_sat: 50 }, { tipo: 'solido', esExcepcion: true, ingredientes: CON_ACEITE }).activos).toEqual([]);
  });

  it('nutriente faltante → ese sello indeterminado; grasa sat con ACEITE añadido sí sale', () => {
    const r = sellosNOM051({ kcal: 300, azucar: null, grasa_sat: 20 }, { tipo: 'solido', ingredientes: CON_ACEITE });
    expect(r.calorias).toBe('exceso');
    expect(r.grasas_saturadas).toBe('exceso'); // (20*9)/300=0.6 y aceite añadido
    expect(r.azucares).toBe('indeterminado');
  });
});

// H1 — GATE DE AÑADIDOS (ancla regulatoria: no debe regresar en silencio).
describe('nom051 · gate de añadidos (H1: naturales NO deben mostrar sellos falsos)', () => {
  it('LECHE pura → CERO sellos de azúcar/grasa (lactosa/grasa natural, no añadidos)', () => {
    const r = sellosNOM051({ kcal: 61, azucar: 4.8, grasa_sat: 1.9 }, { tipo: 'liquido', ingredientes: ['Leche entera pasteurizada'] });
    expect(r.azucares).toBe('no');
    expect(r.grasas_saturadas).toBe('no');
    expect(r.activos).not.toContain('azucares');
    expect(r.activos).not.toContain('grasas_saturadas');
  });
  it('YOGUR natural → sin sello de azúcar', () => {
    const r = sellosNOM051({ kcal: 60, azucar: 5, grasa_sat: 3 }, { tipo: 'liquido', ingredientes: ['Leche', 'Cultivos lácticos'] });
    expect(r.azucares).toBe('no');
  });
  it('JUGO 100% fruta → sin sello de azúcar (no es concentrado añadido)', () => {
    const r = sellosNOM051({ kcal: 45, azucar: 10 }, { tipo: 'liquido', ingredientes: ['Jugo de naranja'] });
    expect(r.azucares).toBe('no');
  });
  it('REFRESCO con jarabe de maíz de alta fructosa + azúcar alta → SÍ EXCESO AZÚCARES', () => {
    const r = sellosNOM051({ kcal: 80, azucar: 12 }, { tipo: 'liquido', ingredientes: ['Agua', 'Jarabe de maíz de alta fructosa'] });
    expect(r.azucares).toBe('exceso');
  });
  it('SIN lista de ingredientes → azúcar/grasa/sodio SUPRIMIDOS (indeterminado); calorías SÍ sale', () => {
    const r = sellosNOM051({ kcal: 300, azucar: 20, grasa_sat: 15, sodio_mg: 400 }, { tipo: 'solido' });
    expect(r.calorias).toBe('exceso'); // sin gate
    expect(r.azucares).toBe('indeterminado');
    expect(r.grasas_saturadas).toBe('indeterminado');
    expect(r.sodio).toBe('indeterminado');
    expect(r.activos).toEqual(['calorias']);
  });
});

describe('nom051 · anadidosDeIngredientes', () => {
  it('detecta añadidos por término, sin falsos ("sal" ⊄ "salvado")', () => {
    expect(anadidosDeIngredientes(['Jarabe de maíz de alta fructosa'])).toMatchObject({ azucares: true });
    expect(anadidosDeIngredientes(['Aceite de palma'])).toMatchObject({ grasas: true });
    expect(anadidosDeIngredientes(['Benzoato de sodio'])).toMatchObject({ sodio: true });
    expect(anadidosDeIngredientes(['Sal yodada'])).toMatchObject({ sodio: true });
    const leche = anadidosDeIngredientes(['Leche entera pasteurizada']);
    expect(leche).toEqual({ azucares: false, grasas: false, sodio: false });
    expect(anadidosDeIngredientes(['Salvado de trigo'])).toMatchObject({ sodio: false }); // no confunde salvado con sal
  });

  it('H4: NEGACIÓN no revive falso positivo ("sin azúcar añadida" → azucares:false)', () => {
    expect(anadidosDeIngredientes(['Sin azúcar añadida'])).toMatchObject({ azucares: false });
    expect(anadidosDeIngredientes(['Sin azúcares añadidos'])).toMatchObject({ azucares: false });
    expect(anadidosDeIngredientes(['Caldo sin sal'])).toMatchObject({ sodio: false });
    expect(anadidosDeIngredientes(['Sin grasa'])).toMatchObject({ grasas: false });
    expect(anadidosDeIngredientes(['Cero azúcar'])).toMatchObject({ azucares: false });
    expect(anadidosDeIngredientes(['Libre de sodio'])).toMatchObject({ sodio: false });
    // la negación anula SÓLO su token: un jarabe real posterior SÍ dispara
    expect(anadidosDeIngredientes(['Sin azúcar añadida', 'Jarabe de maíz'])).toMatchObject({ azucares: true });
  });

  it('L1: "palma" suelta (palmito) no marca grasa; "aceite de palma" sí', () => {
    expect(anadidosDeIngredientes(['Corazón de palma'])).toMatchObject({ grasas: false });
    expect(anadidosDeIngredientes(['Aceite de palma'])).toMatchObject({ grasas: true });
  });

  it('H4 en el sello: yogur "sin azúcar añadida" con lactosa alta → NO EXCESO AZÚCARES', () => {
    const r = sellosNOM051({ kcal: 61, azucar: 4.7 }, { tipo: 'liquido', ingredientes: ['Leche', 'Cultivos', 'Sin azúcar añadida'] });
    expect(r.azucares).toBe('no');
    expect(r.activos).not.toContain('azucares');
  });
});

describe('nom051 · inferirLiquido (H2: huecos cerrados)', () => {
  it('ml/l o categoría de bebida (incl. zumo/néctar/batido/smoothie/bebible) → líquido', () => {
    expect(inferirLiquido({ serving_unit: 'ml' })).toBe(true);
    expect(inferirLiquido({ categoria: 'Zumos de fruta' })).toBe(true);
    expect(inferirLiquido({ categoria: 'Néctar de durazno' })).toBe(true);
    expect(inferirLiquido({ categoria: 'Batidos y smoothies' })).toBe(true);
    expect(inferirLiquido({ categoria: 'Yogur bebible' })).toBe(true);
    expect(inferirLiquido({ unidad: 'g', categoria: 'Galletas' })).toBe(false);
  });
});
