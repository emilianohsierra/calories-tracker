// Parámetros por coach (Ola 1, no-médicos) — plan/ola1-formulas-coaches.md §1–§4.
// DATA-DRIVEN: ajustar aquí si cambian los números; la lógica vive en compute.js.

export const COACHES = {
  perdida_grasa: {
    id: 'perdida_grasa',
    label: 'Pérdida de grasa',
    proteinPerKg: 2.0, // 1.8–2.4
    fatPerKg: 0.8, // piso hormonal
    deficitByRitmo: { conservador: 0.15, moderado: 0.2 }, // agresivo (0.25) NO se ofrece
    defaultRitmo: 'moderado',
  },
  hipertrofia: {
    id: 'hipertrofia',
    label: 'Hipertrofia',
    proteinPerKg: 2.0, // 1.6–2.2
    fatPerKg: 0.9,
    surplusByExp: { novato: 0.15, intermedio: 0.11, avanzado: 0.08 },
    maxGainPctByExp: { novato: 0.005, intermedio: 0.0035, avanzado: 0.0025 }, // kg/sem / peso
    defaultExp: 'novato',
  },
  runner: {
    id: 'runner',
    label: 'Runner',
    proteinPerKg: 1.6, // 1.4–1.8
    fatPerKg: 1.0,
    palBase: 1.35, // vida diaria sin ejercicio (el entreno se suma explícito)
    kcalPorKgKm: 1.0, // ~1 kcal·kg·km
    maxDeficitPct: 0.1, // si quiere bajar grasa, tope 10%
    // carbos mínimos por volumen semanal (g/kg)
    carbMinByKm: [
      { km: 60, gkg: 7 },
      { km: 30, gkg: 6 },
      { km: 0, gkg: 5 },
    ],
  },
  bienestar: {
    id: 'bienestar',
    label: 'Bienestar / hábitos',
    proteinPerKg: 1.4, // 1.2–1.6
    fatPerKg: 0.9,
    // sin déficit por defecto (mantenimiento)
  },
};

export const COACH_IDS = Object.keys(COACHES);

export function getCoach(id) {
  return COACHES[id] || null;
}
