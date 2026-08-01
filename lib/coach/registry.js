// Registro de coaches — metadatos de PRODUCTO. ADITIVO: no toca lib/nutrition ni
// lib/coach/actions.js. La matemática vive en el MOTOR (lib/nutrition/coaches.js); aquí solo
// metadatos + gating + a qué coach del motor mapea cada uno.
//   engine  = id del coach del motor que produce kcal/macros (null = SIN macros automáticos;
//             coaches médicos/etapa: solo apoyo educativo, ver plan/coaches-especializados-arquitectura.md §6).
//   gating  = 'general' | 'medico'
//   estado  = 'activo' (en producto) | 'deferred' (aún no; fase B/D)
//   icono   = SLUG para que Rams elija el asset. NUNCA un emoji (plan/coach-salida-formato.md).

export const COACH_REGISTRY = {
  // --- ACTIVOS: los 5 coaches del motor ya vivos (lib/nutrition/coaches.js) ---
  perdida_grasa: {
    id: 'perdida_grasa', nombre: 'Pérdida de grasa', icono: 'flame',
    especialidad: 'Déficit sostenible con proteína alta', gating: 'general', engine: 'perdida_grasa', estado: 'activo',
  },
  hipertrofia: {
    id: 'hipertrofia', nombre: 'Hipertrofia', icono: 'dumbbell',
    especialidad: 'Superávit controlado y proteína para ganar músculo', gating: 'general', engine: 'hipertrofia', estado: 'activo',
  },
  runner: {
    id: 'runner', nombre: 'Runner', icono: 'footprints',
    especialidad: 'Rendimiento en carrera: carbohidratos e hidratación', gating: 'general', engine: 'runner', estado: 'activo',
  },
  bienestar: {
    id: 'bienestar', nombre: 'Bienestar', icono: 'leaf',
    especialidad: 'Hábitos sostenibles y comer mejor', gating: 'general', engine: 'bienestar', estado: 'activo',
  },
  recomposicion: {
    id: 'recomposicion', nombre: 'Recomposición', icono: 'refresh-cw',
    especialidad: 'Perder grasa y ganar músculo a la vez', gating: 'general', engine: 'recomposicion', estado: 'activo',
  },

  // --- DEFERRED: coaches de dieta (fase B) — overlay sobre un coach base ---
  vegano: {
    id: 'vegano', nombre: 'Vegano', icono: 'sprout',
    especialidad: 'Proteína vegetal y micronutrientes clave', gating: 'general', engine: null, estado: 'deferred',
  },
  keto: {
    id: 'keto', nombre: 'Keto / low-carb', icono: 'egg',
    especialidad: 'Alimentación baja en carbohidratos', gating: 'general', engine: null, estado: 'deferred',
  },
  cardiovascular: {
    id: 'cardiovascular', nombre: 'Salud cardiovascular', icono: 'heart',
    especialidad: 'Patrón cardiosaludable (educativo)', gating: 'general', engine: null, estado: 'deferred',
  },

  // --- DEFERRED (médico/etapa, fase D): SOLO apoyo educativo, requieren revisión legal+clínica ---
  diabetes: {
    id: 'diabetes', nombre: 'Diabetes (apoyo)', icono: 'droplet',
    especialidad: 'Apoyo educativo; no sustituye a tu médico', gating: 'medico', engine: null, estado: 'deferred',
  },
  hipertension: {
    id: 'hipertension', nombre: 'Hipertensión (apoyo)', icono: 'activity',
    especialidad: 'Apoyo educativo; no sustituye a tu médico', gating: 'medico', engine: null, estado: 'deferred',
  },
  embarazo: {
    id: 'embarazo', nombre: 'Embarazo (apoyo)', icono: 'baby',
    especialidad: 'Apoyo informativo; sigue tu control prenatal', gating: 'medico', engine: null, estado: 'deferred',
  },
  infantil: {
    id: 'infantil', nombre: 'Infantil (a familias)', icono: 'blocks',
    especialidad: 'Orientación de hábitos a familias', gating: 'medico', engine: null, estado: 'deferred',
  },
  adulto_mayor: {
    id: 'adulto_mayor', nombre: 'Adulto mayor', icono: 'user-round',
    especialidad: 'Proteína, hidratación y bienestar', gating: 'medico', engine: null, estado: 'deferred',
  },
};

export const COACH_REGISTRY_IDS = Object.keys(COACH_REGISTRY);
export const ACTIVE_COACHES = COACH_REGISTRY_IDS.filter((id) => COACH_REGISTRY[id].estado === 'activo');

export function getCoachMeta(id) {
  return COACH_REGISTRY[id] || null;
}
export function isCoachActive(id) {
  return COACH_REGISTRY[id]?.estado === 'activo';
}
export function isMedicalCoach(id) {
  return COACH_REGISTRY[id]?.gating === 'medico';
}
