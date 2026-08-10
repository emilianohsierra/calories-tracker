import { describe, it, expect } from 'vitest';
import {
  evalMissedMeal, evalLowProtein, evalStreak, evalWeeklyReview,
  enQuietHours, seleccionarPorPresupuesto, calcularRacha, diaPrevio, dedupeKey,
  PRIORIDAD, UMBRAL_PROTEINA_G,
} from './triggers.js';

describe('triggers · missed_meal', () => {
  it('dispara si no hay registro hoy (kcal 0) y ya es tarde', () => {
    const n = evalMissedMeal({ consumido: { kcal: 0, protein_g: 0 }, horaLocal: 20 });
    expect(n?.event_type).toBe('missed_meal');
    expect(n.prioridad).toBe(PRIORIDAD.MEDIA);
  });
  it('NO dispara si ya registró algo', () => {
    expect(evalMissedMeal({ consumido: { kcal: 500, protein_g: 20 }, horaLocal: 20 })).toBeNull();
  });
  it('NO dispara sin datos', () => {
    expect(evalMissedMeal({ consumido: null, horaLocal: 20 })).toBeNull();
  });
  it('OBS-2: NO dispara por la mañana aunque no haya registro (piso de hora)', () => {
    expect(evalMissedMeal({ consumido: { kcal: 0, protein_g: 0 }, horaLocal: 9 })).toBeNull();
  });
  it('OBS-2: NO dispara sin horaLocal (fail-closed)', () => {
    expect(evalMissedMeal({ consumido: { kcal: 0, protein_g: 0 } })).toBeNull();
  });
});

describe('triggers · low_protein (cifras del motor)', () => {
  const objetivo = { protein_g: 120, kcal: 2000 };
  it('dispara si registró algo y falta proteína >= umbral', () => {
    const n = evalLowProtein({ objetivo, consumido: { kcal: 800, protein_g: 60 }, horaLocal: 20 });
    expect(n?.event_type).toBe('low_protein');
    expect(n.cuerpo).toContain('60'); // pendiente 120-60=60
    expect(n.cuerpo).toContain('120');
  });
  it('NO dispara si el pendiente < umbral', () => {
    const consumido = { kcal: 800, protein_g: 120 - (UMBRAL_PROTEINA_G - 1) };
    expect(evalLowProtein({ objetivo, consumido, horaLocal: 20 })).toBeNull();
  });
  it('NO dispara sin registro hoy (lo cubre missed_meal)', () => {
    expect(evalLowProtein({ objetivo, consumido: { kcal: 0, protein_g: 0 }, horaLocal: 20 })).toBeNull();
  });
  it('NO dispara sin objetivo (perfil incompleto)', () => {
    expect(evalLowProtein({ objetivo: null, consumido: { kcal: 800, protein_g: 10 }, horaLocal: 20 })).toBeNull();
  });
  it('OBS-2: NO dispara por la mañana (piso de hora)', () => {
    expect(evalLowProtein({ objetivo, consumido: { kcal: 800, protein_g: 60 }, horaLocal: 9 })).toBeNull();
  });
});

describe('triggers · streak (hábito, no dieta)', () => {
  it('celebra al llegar a un hito con registro hoy', () => {
    const n = evalStreak({ rachaHoy: 7, rachaAyer: 6, registroHoy: true });
    expect(n?.prioridad).toBe(PRIORIDAD.MEDIA);
    expect(n.titulo).toContain('7');
  });
  it('NO celebra fuera de hito', () => {
    expect(evalStreak({ rachaHoy: 5, rachaAyer: 4, registroHoy: true })).toBeNull();
  });
  it('avisa "en riesgo" con prioridad ALTA si no registró hoy y venía de racha', () => {
    const n = evalStreak({ rachaHoy: 0, rachaAyer: 5, registroHoy: false });
    expect(n?.prioridad).toBe(PRIORIDAD.ALTA);
    expect(n.cuerpo).toContain('5');
  });
  it('NO avisa en riesgo si la racha hasta ayer es corta', () => {
    expect(evalStreak({ rachaHoy: 0, rachaAyer: 2, registroHoy: false })).toBeNull();
  });
});

describe('triggers · weekly_review (gating Pro)', () => {
  const base = { esDiaReporte: true, diasConRegistro: 5, kcalPromedio: 1850 };
  it('dispara para Pro el día del reporte', () => {
    const n = evalWeeklyReview({ ...base, isPro: true });
    expect(n?.event_type).toBe('weekly_review');
    expect(n.cuerpo).toContain('5/7');
  });
  it('NO dispara para Free (gating)', () => {
    expect(evalWeeklyReview({ ...base, isPro: false })).toBeNull();
  });
  it('NO dispara fuera del día del reporte', () => {
    expect(evalWeeklyReview({ ...base, isPro: true, esDiaReporte: false })).toBeNull();
  });
});

describe('anti-spam · quiet hours (wraparound)', () => {
  it('franja nocturna 22→8 silencia la madrugada', () => {
    expect(enQuietHours(23, 22, 8)).toBe(true);
    expect(enQuietHours(3, 22, 8)).toBe(true);
    expect(enQuietHours(7, 22, 8)).toBe(true);
  });
  it('19-20h (hora del cron) NO está en quiet 22→8', () => {
    expect(enQuietHours(19, 22, 8)).toBe(false);
    expect(enQuietHours(20, 22, 8)).toBe(false);
  });
  it('franja diurna simple 8→22', () => {
    expect(enQuietHours(12, 8, 22)).toBe(true);
    expect(enQuietHours(23, 8, 22)).toBe(false);
  });
  it('start === end nunca silencia', () => {
    expect(enQuietHours(3, 0, 0)).toBe(false);
  });
});

describe('anti-spam · presupuesto por modo + prioridad', () => {
  const alta = { event_type: 'streak', prioridad: PRIORIDAD.ALTA };
  const media1 = { event_type: 'missed_meal', prioridad: PRIORIDAD.MEDIA };
  const media2 = { event_type: 'low_protein', prioridad: PRIORIDAD.MEDIA };

  it('tranquilo (1) toma solo 1 y ordena por prioridad', () => {
    const out = seleccionarPorPresupuesto([media1, alta], 'tranquilo', 0);
    expect(out).toHaveLength(1);
    expect(out[0].prioridad).toBe(PRIORIDAD.ALTA);
  });
  it('los ALTA saltan el presupuesto agotado', () => {
    const out = seleccionarPorPresupuesto([media1, media2, alta], 'tranquilo', 0);
    // budget 1 → toma alta (por orden); media quedan fuera salvo que sean ALTA → aquí solo pasa 1
    expect(out.some((n) => n.prioridad === PRIORIDAD.ALTA)).toBe(true);
  });
  it('respeta lo ya enviado hoy', () => {
    const out = seleccionarPorPresupuesto([media1, media2], 'normal', 3); // budget 3, ya 3 → 0 restante
    expect(out).toHaveLength(0);
  });
  it('normal (3) toma varios de prioridad media', () => {
    const out = seleccionarPorPresupuesto([media1, media2], 'normal', 0);
    expect(out).toHaveLength(2);
  });
});

describe('racha · calcularRacha / diaPrevio', () => {
  it('diaPrevio cruza meses correctamente', () => {
    expect(diaPrevio('2026-03-01')).toBe('2026-02-28');
    expect(diaPrevio('2026-01-01')).toBe('2025-12-31');
  });
  it('cuenta días consecutivos terminando hoy', () => {
    const fechas = new Set(['2026-08-06', '2026-08-07', '2026-08-08']);
    const { rachaHoy, registroHoy } = calcularRacha(fechas, '2026-08-08');
    expect(registroHoy).toBe(true);
    expect(rachaHoy).toBe(3);
  });
  it('rachaAyer ignora el hueco de hoy (día de gracia)', () => {
    const fechas = new Set(['2026-08-05', '2026-08-06', '2026-08-07']); // sin hoy 08
    const { rachaHoy, rachaAyer, registroHoy } = calcularRacha(fechas, '2026-08-08');
    expect(registroHoy).toBe(false);
    expect(rachaHoy).toBe(0);
    expect(rachaAyer).toBe(3);
  });
  it('sin registros → todo 0', () => {
    const { rachaHoy, rachaAyer } = calcularRacha(new Set(), '2026-08-08');
    expect(rachaHoy).toBe(0);
    expect(rachaAyer).toBe(0);
  });
});

describe('dedupeKey', () => {
  it('encoda tipo+día', () => {
    expect(dedupeKey('streak', '2026-08-08')).toBe('streak:2026-08-08');
  });
});
