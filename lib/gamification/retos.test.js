import { describe, it, expect } from 'vitest';
import {
  RETOS, RETO_TIPOS, RETO_TIPOS_PERMITIDOS, PERIODOS, RETO_METRICAS,
  POOL_DIARIO, POOL_SEMANAL, retoPorId, retosDiarios, retosSemanales,
  retoEsSeguro, validarCatalogo, copySeguro, elegirDiario, elegirSemanal,
  CHECKIN, NOTIF,
} from './retos';
import { EVENTOS } from './eventos';

// Blindaje del catálogo de retos + copy. LÍNEA ROJA TCA: nada de comer-menos/peso/déficit/ayuno.

describe('whitelist cerrada de tipos', () => {
  it('7 tipos permitidos y ningún reto fuera de la whitelist', () => {
    expect(RETO_TIPOS_PERMITIDOS.size).toBe(7);
    for (const r of RETOS) expect(RETO_TIPOS_PERMITIDOS.has(r.tipo)).toBe(true);
  });
});

describe('catálogo válido y seguro (línea roja)', () => {
  it('validarCatalogo() → sin problemas', () => {
    expect(validarCatalogo()).toEqual([]);
  });
  it('cada reto: tipo whitelist, se alimenta de eventos de V1 o métrica guardada, meta>0', () => {
    for (const r of RETOS) {
      expect(retoEsSeguro(r)).toBe(true);
      const evs = r.eventos || [];
      for (const e of evs) expect(Object.values(EVENTOS)).toContain(e);
      if (r.metrica != null) expect(RETO_METRICAS.has(r.metrica)).toBe(true);
      expect(Number(r.meta)).toBeGreaterThan(0);
    }
  });
  it('ningún título/descripción cruza la línea roja', () => {
    for (const r of RETOS) {
      expect(copySeguro(r.titulo)).toBe(true);
      expect(copySeguro(r.descripcion)).toBe(true);
    }
  });
});

describe('copySeguro (filtro de intents prohibidos)', () => {
  it('bloquea comer-menos/peso/déficit/ayuno/competir', () => {
    for (const bad of ['baja 2 kg esta semana', 'reto: come menos hoy', '3 días en déficit', 'ayuno de 16h', 'quién come menos', 'pierde peso rápido', 'saltarse la cena']) {
      expect(copySeguro(bad)).toBe(false);
    }
  });
  it('no da falsos positivos en copy sano', () => {
    for (const ok of ['Registra tu desayuno', 'Mantente en tu rango de energía', 'Suma tu proteína', 'Aprende algo hoy', 'ni de más, ni de menos']) {
      expect(copySeguro(ok)).toBe(true);
    }
  });
  it('retoEsSeguro rechaza tipos fuera de whitelist', () => {
    expect(retoEsSeguro({ tipo: 'comer_menos', periodo: 'diario', meta: 1, eventos: [EVENTOS.DAY_COMPLETED], titulo: 'x', descripcion: 'y' })).toBe(false);
    expect(retoEsSeguro({ tipo: RETO_TIPOS.REGISTRAR_DIAS, periodo: 'diario', meta: 1, eventos: ['EVENTO_FALSO'], titulo: 'x', descripcion: 'y' })).toBe(false);
    expect(retoEsSeguro({ tipo: RETO_TIPOS.EN_RANGO_DIAS, periodo: 'diario', meta: 1, titulo: 'baja de peso', descripcion: 'y', metrica: 'rango_dias' })).toBe(false);
  });
});

describe('pools + selección determinista (1 diario + 1 semanal)', () => {
  it('pools no vacíos y disjuntos por periodo', () => {
    expect(POOL_DIARIO.length).toBeGreaterThan(0);
    expect(POOL_SEMANAL.length).toBeGreaterThan(0);
    expect(retosDiarios().every((r) => r.periodo === PERIODOS.DIARIO)).toBe(true);
    expect(retosSemanales().every((r) => r.periodo === PERIODOS.SEMANAL)).toBe(true);
  });
  it('elegirDiario/elegirSemanal son deterministas y devuelven un reto del pool correcto', () => {
    const d = elegirDiario(3);
    expect(d).toEqual(elegirDiario(3)); // mismo seed → mismo reto
    expect(d.periodo).toBe(PERIODOS.DIARIO);
    const s = elegirSemanal(10);
    expect(s.periodo).toBe(PERIODOS.SEMANAL);
    // seed negativo / no numérico no rompe
    expect(elegirDiario(-1)).not.toBeNull();
    expect(elegirDiario('x')).not.toBeNull();
  });
  it('retoPorId encuentra y devuelve null si no existe', () => {
    expect(retoPorId('diario_registrar').tipo).toBe(RETO_TIPOS.REGISTRAR_DIAS);
    expect(retoPorId('inexistente')).toBeNull();
  });
});

describe('banco CHECK-IN (cualitativo, sin números de cuerpo)', () => {
  it('ánimo y energía tienen 5 caritas cualitativas y copy seguro', () => {
    for (const dim of [CHECKIN.animo, CHECKIN.energia]) {
      expect(dim.caritas).toHaveLength(5);
      expect(copySeguro(dim.pregunta)).toBe(true);
      for (const c of dim.caritas) {
        expect(copySeguro(c)).toBe(true);
        expect(/\d/.test(c)).toBe(false); // sin números (nada de peso/medidas)
      }
    }
    for (const g of CHECKIN.gracias) expect(copySeguro(g)).toBe(true);
  });
});

describe('banco NOTIF (solo positivas, sin culpa/nags/presión)', () => {
  it('categorías presentes y todas las líneas seguras', () => {
    for (const cat of ['reto_por_cerrar', 'racha_dia_gracia', 'logro', 'nivel', 'reengagement_suave']) {
      expect(Array.isArray(NOTIF[cat])).toBe(true);
      expect(NOTIF[cat].length).toBeGreaterThan(0);
      for (const linea of NOTIF[cat]) {
        expect(copySeguro(linea)).toBe(true);
        // sin culpa/regaño/presión ansiógena
        expect(/fallaste|no registraste|te quedan \d|racha muere|no me abandones/i.test(linea)).toBe(false);
      }
    }
  });
});
