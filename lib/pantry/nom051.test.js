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

  it('bebida SIN calorías, sodio bajo (<300) → sodio "no" (Karpathy §1: mg/kcal no aplica a kcal 0; sin borde-45)', () => {
    const r = sellosNOM051({ kcal: 0, sodio_mg: 50 }, { tipo: 'liquido', ingredientes: CON_SAL });
    expect(r.sodio).toBe('no');
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
  it('LECHE pura → azúcar "no" (lactosa intrínseca); grasa sat NO se asevera → revisar_exencion (mono-natural)', () => {
    const r = sellosNOM051({ kcal: 61, azucar: 4.8, grasa_sat: 1.9 }, { tipo: 'liquido', ingredientes: ['Leche entera pasteurizada'] });
    expect(r.azucares).toBe('no');
    expect(r.grasas_saturadas).toBe('indeterminado'); // exención mono-ingrediente (Karpathy §83)
    expect(r.revisar_exencion).toBe(true);
    expect(r.activos).not.toContain('azucares');
    expect(r.activos).not.toContain('grasas_saturadas'); // nunca sello falso en natural
  });
  it('YOGUR natural (2+ ingredientes) → sin sello de azúcar; NO mono-natural', () => {
    const r = sellosNOM051({ kcal: 60, azucar: 5, grasa_sat: 3 }, { tipo: 'liquido', ingredientes: ['Leche', 'Cultivos lácticos'] });
    expect(r.azucares).toBe('no');
    expect(r.revisar_exencion).toBe(false);
  });
  it('JUGO 100% fruta → EXCESO AZÚCARES (azúcares del jugo cuentan como LIBRES, WHO/NOM — Karpathy §81)', () => {
    const r = sellosNOM051({ kcal: 45, azucar: 10 }, { tipo: 'liquido', ingredientes: ['Jugo de naranja'] });
    expect(r.azucares).toBe('exceso');
    expect(r.calorias).toBe('no'); // 45 < 70
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

describe('nom051 · #2 líquido/sólido: detección + umbral calórico correcto', () => {
  it('bebidas (refresco/jugo/agua/leche) → líquido', () => {
    expect(inferirLiquido({ categoria: 'Refresco de cola' })).toBe(true);
    expect(inferirLiquido({ categoria: 'Jugo de naranja' })).toBe(true);
    expect(inferirLiquido({ categoria: 'Agua embotellada' })).toBe(true);
    expect(inferirLiquido({ categoria: 'Leche entera' })).toBe(true);
    expect(inferirLiquido({ categoria: 'Horchata' })).toBe(true);
  });
  it('sólidos (galleta/pan/botana) → sólido; FALLBACK conservador sin señal → sólido', () => {
    expect(inferirLiquido({ categoria: 'Pan de caja', unidad: 'g' })).toBe(false);
    expect(inferirLiquido({ categoria: 'Botana de maíz' })).toBe(false);
    expect(inferirLiquido({})).toBe(false); // sin ninguna señal → sólido (conservador)
    expect(inferirLiquido({ unidad: 'pieza' })).toBe(false);
  });
  it('señal EXPLÍCITA de tipo/tags manda (estructural, no adivina)', () => {
    expect(inferirLiquido({ tipo: 'liquido' })).toBe(true);
    expect(inferirLiquido({ type: 'beverage' })).toBe(true);
    expect(inferirLiquido({ tipo: 'solido', unidad: 'ml' })).toBe(false); // tipo explícito gana
    expect(inferirLiquido({ tags: ['snack', 'bebida'] })).toBe(true);
  });
  it('UMBRAL calórico: 100 kcal/100 → líquido EXCESO (≥70), sólido NO (<275)', () => {
    const nut = { kcal: 100, azucar: 0, grasa_sat: 0, grasa_trans: 0, sodio_mg: 0 };
    expect(sellosNOM051(nut, { isLiquid: true }).calorias).toBe('exceso'); // 100 ≥ 70
    expect(sellosNOM051(nut, { isLiquid: false }).calorias).toBe('no');    // 100 < 275
  });
  it('no rompe sellos ya correctos: sólido calórico (300) sigue EXCESO; líquido bajo (50) sigue NO', () => {
    expect(sellosNOM051({ kcal: 300 }, { isLiquid: false }).calorias).toBe('exceso');
    expect(sellosNOM051({ kcal: 50 }, { isLiquid: true }).calorias).toBe('no');
  });
  it('FALLBACK ambiguo (forma indeterminada): kcal<70 NO, kcal≥275 EXCESO, 70≤kcal<275 → null', () => {
    expect(sellosNOM051({ kcal: 60 }, { forma: 'indeterminada' }).calorias).toBe('no');       // ambos umbrales: no
    expect(sellosNOM051({ kcal: 300 }, { forma: 'indeterminada' }).calorias).toBe('exceso');  // ambos: sí
    const amb = sellosNOM051({ kcal: 100 }, { forma: 'indeterminada' });                       // discrepan → no determinable
    expect(amb.calorias).toBe('indeterminado');
    expect(amb.activos).not.toContain('calorias');
  });
});

describe('nom051 · #2 casos borde MX de Karpathy (§3)', () => {
  const cola = ['Agua', 'Jarabe de maíz de alta fructosa'];
  it('refresco cola ~42 kcal/100 mL, azúcar alto → AZÚCARES sí, CALORÍAS NO (42<70)', () => {
    const r = sellosNOM051({ kcal: 42, azucar: 10.6 }, { forma: 'liquido', ingredientes: cola });
    expect(r.azucares).toBe('exceso');
    expect(r.calorias).toBe('no');
  });
  it('yogur BEBIBLE ~75/100 mL → CALORÍAS SÍ (75≥70); yogur SÓLIDO ~95/100 g → CALORÍAS NO (95<275)', () => {
    expect(sellosNOM051({ kcal: 75 }, { forma: 'liquido' }).calorias).toBe('exceso');
    expect(sellosNOM051({ kcal: 95 }, { forma: 'solido' }).calorias).toBe('no');
  });
  it('leche entera ~62: azúcares NO (lactosa), CALORÍAS NO (62<70), grasa sat → revisar_exencion', () => {
    const r = sellosNOM051({ kcal: 62, azucar: 4.7, grasa_sat: 1.9 }, { forma: 'liquido', ingredientes: ['Leche entera'] });
    expect(r.azucares).toBe('no');
    expect(r.calorias).toBe('no');
    expect(r.revisar_exencion).toBe(true);
    expect(r.activos).toEqual([]);
  });
  it('sopa polvo (sólido) → SODIO por ≥300 mg/100 g; sopa líquida → SODIO por mg/kcal', () => {
    expect(sellosNOM051({ kcal: 350, sodio_mg: 400 }, { forma: 'solido', ingredientes: ['Harina', 'Sal', 'Glutamato monosódico'] }).sodio).toBe('exceso');
    expect(sellosNOM051({ kcal: 30, sodio_mg: 200 }, { forma: 'liquido', ingredientes: ['Agua', 'Sal', 'Caldo'] }).sodio).toBe('exceso'); // 200/30 ≥ 1 mg/kcal
  });
  it('jugo detectado por esJugo (categoría) sin azúcar añadido → AZÚCARES exceso', () => {
    const r = sellosNOM051({ kcal: 45, azucar: 10 }, { forma: 'liquido', esJugo: true, ingredientes: ['Néctar de mango'] });
    expect(r.azucares).toBe('exceso');
  });
});
