import { describe, it, expect } from 'vitest';
import { clasificarItem, filtrarDespensaSegura, gruposActivos } from './safety';
import { quePuedoComer } from './suggest';

// SEGURIDAD DE ALÉRGENOS del reco (bloqueante #1 de Slowking). Contrato del CTO:
//   item = { ..., allergens: string[] (group keys), confianza: 'verified'|'user'|'ai' }
//   verificado => allergens poblado (confiable); no-verificado => allergens=[] (nombre-solo).

// Ítem NO VERIFICADO (nombre-solo) — el caso peligroso.
const mk = (nombre) => ({
  pantry_item_id: nombre, nombre, cantidad: 1, unidad: 'porcion', ingredientes: [nombre],
  allergens: [], confianza: 'ai',
  nutricion: { base: 'por_porcion', kcal: 100, prot: 5, carb: 5, gras: 5, procedencia: 'estimado' },
});
// Ítem VERIFICADO (OFF/servicio) con allergens estructurados (group keys).
const mkVer = (nombre, allergens) => ({ ...mk(nombre), allergens, confianza: 'verified' });

// Los 15 casos EXACTOS de Slowking + los pedidos (brie/gruyere/provolone/ricotta/feta).
const FUGAS = [
  ['lacteos', ['mozzarella', 'cheddar', 'manchego', 'parmesano', 'gouda', 'philadelphia', 'brie', 'gruyere', 'provolone', 'ricotta', 'feta']],
  ['gluten', ['pizza', 'baguette', 'croissant', 'cereal']],
  ['frutos secos', ['nutella', 'mazapan']],
  ['mani', ['mazapan', 'mazapan de la rosa']],
  ['mariscos', ['surimi']],
];

describe('BLOQUEANTE #1 — nombres/marcas que SON el alérgeno (NO verificados) → INSEGURO', () => {
  for (const [alergia, nombres] of FUGAS) {
    for (const nombre of nombres) {
      it(`"${nombre}" con alergia "${alergia}" → INSEGURO`, () => {
        expect(clasificarItem(mk(nombre), [alergia]).status).toBe('INSEGURO');
      });
      it(`"${nombre}" NO se sugiere (probado en política permisiva 'advertir' → lo cierra el léxico)`, () => {
        const ops = quePuedoComer({ kcal: 600, prot: 40 }, [mk(nombre), mkVer('arroz', [])], 'bienestar', [alergia], { politicaNoVerificado: 'advertir' });
        const ids = ops.flatMap((o) => o.items.map((i) => i.pantry_item_id));
        expect(ids).not.toContain(nombre);
      });
    }
  }
});

describe('VERIFICADO — filtra por allergens ESTRUCTURADOS', () => {
  it('group-key que intersecta la alergia → INSEGURO', () => {
    expect(clasificarItem(mkVer('Queso gouda', ['lacteo']), ['lacteos']).status).toBe('INSEGURO');
    expect(clasificarItem(mkVer('Botana', ['mani']), ['mani']).status).toBe('INSEGURO');
  });
  it('verificado SIN intersección → SEGURO', () => {
    expect(clasificarItem(mkVer('Barra', ['soya']), ['lacteos']).status).toBe('SEGURO');
    expect(clasificarItem(mkVer('Arroz', []), ['lacteos']).status).toBe('SEGURO');
  });
});

// REGRESIÓN #3 (Slowking): off.js entrega TOKENS OFF CRUDOS, no group-keys. Con esos tokens
// reales, un verificado con el alérgeno DEBE excluirse (antes se colaba SEGURO = fuga silenciosa).
describe('REGRESIÓN #3 — tokens OFF CRUDOS reales de off.js → EXCLUIDO', () => {
  // TOKENS AUTORITATIVOS del CTO (documentados en off.js / normalizeAllergens), 1:1 por grupo.
  const CRUDOS = [
    ['lacteos', ['milk']],
    ['gluten', ['gluten', 'wheat', 'barley', 'rye', 'oats', 'spelt', 'kamut']],
    ['huevo', ['eggs', 'egg']],
    ['frutos secos', ['nuts', 'tree-nuts', 'almonds', 'hazelnuts', 'walnuts', 'cashew-nuts', 'cashew', 'pecan-nuts', 'pistachios', 'macadamia-nuts', 'queensland-nuts', 'brazil-nuts']],
    ['mani', ['peanuts']],
    ['soya', ['soybeans', 'soy']],
    ['pescado', ['fish']],
    ['mariscos', ['crustaceans', 'molluscs', 'shellfish']],
    ['ajonjoli', ['sesame-seeds', 'sesame']],
    ['mostaza', ['mustard']],
    ['apio', ['celery', 'celeriac']],
    ['sulfitos', ['sulphites']], // off.js ya aplica alias de sulphur-dioxide-and-sulphites → sulphites
    ['altramuz', ['lupin']],
  ];
  for (const [alergia, tokens] of CRUDOS) {
    for (const tok of tokens) {
      it(`verificado allergens=['${tok}'] + "${alergia}" → INSEGURO`, () => {
        expect(clasificarItem(mkVer('Producto empacado', [tok]), [alergia]).status).toBe('INSEGURO');
      });
      it(`"${tok}" NO se sugiere en quePuedoComer`, () => {
        const ops = quePuedoComer({ kcal: 600, prot: 40 }, [mkVer('Producto', [tok]), mkVer('arroz', [])], 'bienestar', [alergia]);
        expect(ops.flatMap((o) => o.items.map((i) => i.pantry_item_id))).not.toContain('Producto');
      });
    }
  }
  it("'peanuts' mapea a maní, NO a frutos_secos (no cruza por 'nuts')", () => {
    expect(clasificarItem(mkVer('Botana', ['peanuts']), ['mani']).status).toBe('INSEGURO');
  });
  it('tokens FUERA de la lista caen al fallback includes (cashews/pecans/macadamia → frutos_secos)', () => {
    for (const tok of ['cashews', 'pecans', 'macadamia', 'hazelnut']) {
      expect(clasificarItem(mkVer('Botana', [tok]), ['frutos secos']).status).toBe('INSEGURO');
    }
  });
});

// BELT (Slowking): un hueco de tag NO debe colar un alérgeno de nombre evidente en verificados.
describe('BELT — verificado con tag faltante pero nombre evidente → INSEGURO', () => {
  it('verificado allergens=[] pero nombre mozzarella + lácteos → INSEGURO (léxico)', () => {
    expect(clasificarItem(mkVer('mozzarella', []), ['lacteos']).status).toBe('INSEGURO');
  });
  it('verificado allergens=[] pero nombre surimi + mariscos → INSEGURO', () => {
    expect(clasificarItem(mkVer('surimi', []), ['mariscos']).status).toBe('INSEGURO');
  });
});

describe('NO VERIFICADO sin golpe + alergia de grupo → fail-safe', () => {
  it('DESCONOCIDO', () => {
    expect(clasificarItem(mk('Barrita casera'), ['lacteos']).status).toBe('DESCONOCIDO');
  });
  it('DEFAULT (excluir): se excluye — NO asumir seguro (Slowking)', () => {
    const { seguros, excluidos } = filtrarDespensaSegura([mk('Barrita casera')], ['lacteos']);
    expect(seguros).toHaveLength(0);
    expect(excluidos[0].motivo).toBe('no_verificado');
  });
  it('lactosa (NO anafiláctica) + advertir: incluye con advertencia CLARA', () => {
    const { seguros } = filtrarDespensaSegura([mk('Barrita casera')], ['lacteos'], { politicaNoVerificado: 'advertir' });
    expect(seguros).toHaveLength(1);
    expect(seguros[0].advertencia.texto).toMatch(/revisa el etiquetado/i);
  });
});

describe('FIX SEGURIDAD — anafilácticos fuerzan EXCLUIR en DESCONOCIDO, SIEMPRE', () => {
  const ANAFILACTICOS = ['mani', 'frutos secos', 'mariscos', 'pescado', 'huevo', 'soya', 'ajonjoli', 'mostaza', 'apio', 'sulfitos', 'altramuz'];
  for (const alergia of ANAFILACTICOS) {
    it(`"${alergia}" DESCONOCIDO → EXCLUIDO aunque el llamador pida 'advertir'`, () => {
      const { seguros, excluidos } = filtrarDespensaSegura([mk('Barrita casera')], [alergia], { politicaNoVerificado: 'advertir' });
      expect(seguros).toHaveLength(0);
      expect(excluidos[0].motivo).toBe('no_verificado');
    });
  }
  it('mezcla lactosa + maní: el anafiláctico manda → EXCLUIDO aunque pida advertir', () => {
    const { seguros } = filtrarDespensaSegura([mk('Barrita casera')], ['lacteos', 'mani'], { politicaNoVerificado: 'advertir' });
    expect(seguros).toHaveLength(0);
  });
  it('quePuedoComer no pasa política y NO puede reactivar advertir para anafilácticos', () => {
    const ops = quePuedoComer({ kcal: 600, prot: 40 }, [mk('Barrita casera')], 'bienestar', ['mani'], { politicaNoVerificado: 'advertir' });
    expect(ops).toEqual([]); // ningún item sugerible → sin opciones
  });
});

describe('BACKLOG cerrado — grupos nuevos (varios anafilácticos) bloquean', () => {
  const NUEVOS = [
    ['mostaza', ['mostaza', 'dijon', 'mostaza dijon']],
    ['apio', ['apio', 'celery', 'sal de apio']],
    ['sulfitos', ['vino', 'metabisulfito', 'orejones']],
    ['altramuz', ['altramuz', 'lupino', 'harina de lupino']],
  ];
  for (const [alergia, nombres] of NUEVOS) {
    for (const nombre of nombres) {
      it(`"${nombre}" con alergia "${alergia}" → INSEGURO (léxico) y no se sugiere`, () => {
        expect(clasificarItem(mk(nombre), [alergia]).status).toBe('INSEGURO');
        const ops = quePuedoComer({ kcal: 600, prot: 40 }, [mk(nombre), mkVer('arroz', [])], 'bienestar', [alergia], { politicaNoVerificado: 'advertir' });
        expect(ops.flatMap((o) => o.items.map((i) => i.pantry_item_id))).not.toContain(nombre);
      });
    }
  }
  it('verificado con group-key nuevo que intersecta → INSEGURO', () => {
    expect(clasificarItem(mkVer('Aderezo', ['mostaza']), ['mostaza']).status).toBe('INSEGURO');
    expect(clasificarItem(mkVer('Sopa', ['apio']), ['celery']).status).toBe('INSEGURO');
  });
});

describe('sin alergias → sin bloqueos ni disclaimer', () => {
  it('un no-verificado se puede sugerir si el usuario NO es alérgico', () => {
    expect(clasificarItem(mk('mozzarella'), []).status).toBe('SEGURO');
    const ops = quePuedoComer({ kcal: 600, prot: 30 }, [mk('mozzarella')], 'bienestar', []);
    expect(ops.length).toBeGreaterThan(0);
    expect(ops[0].disclaimer).toBeNull();
    expect(ops[0].advertencia).toBeNull();
  });
});

describe('DISCLAIMER visible cuando hay alergias (§3)', () => {
  it('las opciones (con ítems verificados seguros) traen disclaimer', () => {
    const ops = quePuedoComer({ kcal: 600, prot: 30 }, [mkVer('arroz', []), mkVer('atun', ['pescado'])], 'bienestar', ['lacteos']);
    expect(ops.length).toBeGreaterThan(0);
    expect(ops[0].disclaimer).toMatch(/revisa siempre el etiquetado/i);
  });
});

describe('gruposActivos (mapeo de restricción → grupo)', () => {
  it('reconoce acentos/plurales/sinónimos', () => {
    expect(gruposActivos(['lácteos']).has('lacteo')).toBe(true);
    expect(gruposActivos(['maní']).has('mani')).toBe(true);
    expect(gruposActivos(['frutos secos']).has('frutos_secos')).toBe(true);
    expect(gruposActivos(['gluten']).has('gluten')).toBe(true);
    expect(gruposActivos(['mariscos']).has('marisco')).toBe(true);
    expect(gruposActivos(['pollo']).size).toBe(0); // alimento específico, no grupo
  });
});
