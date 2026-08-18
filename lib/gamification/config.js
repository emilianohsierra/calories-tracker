// Gamificación V1 — CONFIG versionada (patrón curriculum.js/platillos.js): XP, niveles y catálogo de
// logros. Editable por PR (revisión de Karpathy TCA + Drucker/Lugia copy), deploy-safe, SIN tabla ni
// migración por logro. Los nombres/umbrales son RENOMBRABLES/recalibrables sin tocar lógica.
//
// REGLA DURA (Karpathy, plan/gamificacion-seguridad-tca.md): se premia CONDUCTA (registrar/aprender/
// hábito/adherencia/entreno/despensa), NUNCA comer poco/saltarse/déficit/peso. La racha es de REGISTRO.

// ── XP por evento (§3, recalibrable) ──────────────────────────────────────────────────────────────
export const XP = {
  MEAL_LOGGED: 10,        // por comida registrada (dedupe por meal_id)
  LESSON_COMPLETED: 25,   // por lección aprendida (1× por concepto, sin farmear)
  DAY_COMPLETED: 20,      // día con registro (hábito), estado-derivado (cron)
  GOAL_REACHED: 30,       // objetivo del día cumplido (aditivo / EN RANGO, nunca "comió menos")
  WORKOUT_LOGGED: 15,     // entreno marcado 'hecho'
  WEEKLY_CONSISTENT: 100, // semana consistente de registro
  CHECKIN_COMPLETED: 5,   // check-in del día (agua/ánimo/estado)
  PANTRY_ITEM_ADDED: 5,   // surtió su despensa (planificar)
};

// ── Niveles (nombres RENOMBRABLES, umbrales recalibrables). nivelDe() en eventos.js. ──
export const NIVELES = [
  { n: 1, nombre: 'Aprendiz', min: 0 },
  { n: 2, nombre: 'Constante', min: 150 },
  { n: 3, nombre: 'Disciplinado', min: 500 },
  { n: 4, nombre: 'En racha', min: 1200 },
  { n: 5, nombre: 'Maestro de hábitos', min: 2500 },
  { n: 6, nombre: 'Leyenda del hábito', min: 5000 },
];

// ── Catálogo de LOGROS (config; SIN tabla). `criterio(estado)` es PURO y determinista sobre el estado
//    agregado del usuario (todo CONDUCTA, jamás peso/comer-menos). `oculto` = §5 (curiosidad, se revela al
//    desbloquear). 5 categorías (Drucker). El contenido/copy se reconcilia con el catálogo de Karpathy. ──
export const LOGROS = [
  // registro
  { code: 'primer_registro', categoria: 'registro', nombre: 'Primer registro', desc: 'Registraste tu primera comida.', oculto: false, criterio: (e) => (e.dias_registrados || 0) >= 1 },
  { code: 'racha_7', categoria: 'registro', nombre: '7 días seguidos', desc: 'Una semana registrando. Así se construye el hábito.', oculto: false, criterio: (e) => (e.racha || 0) >= 7 },
  { code: 'racha_30', categoria: 'registro', nombre: '30 días de hábito', desc: 'Un mes de constancia registrando.', oculto: false, criterio: (e) => (e.racha || 0) >= 30 },
  // aprendizaje
  { code: 'primera_leccion', categoria: 'aprendizaje', nombre: 'Primera lección', desc: 'Completaste tu primera lección.', oculto: false, criterio: (e) => (e.lecciones || 0) >= 1 },
  { code: 'aprendiz_5', categoria: 'aprendizaje', nombre: 'Curioso', desc: 'Completaste 5 lecciones.', oculto: false, criterio: (e) => (e.lecciones || 0) >= 5 },
  // adherencia (aditiva / EN RANGO — nunca comer menos)
  { code: 'proteina_5', categoria: 'adherencia', nombre: 'Proteína en meta', desc: 'Llegaste a tu proteína 5 días.', oculto: false, criterio: (e) => (e.prot_meta_dias || 0) >= 5 },
  { code: 'rango_5', categoria: 'adherencia', nombre: 'En tu rango', desc: 'Estuviste en tu rango de energía 5 días (ni de más, ni de menos).', oculto: false, criterio: (e) => (e.rango_dias || 0) >= 5 },
  // hábito / consistencia
  { code: 'semana_consistente', categoria: 'habito', nombre: 'Semana redonda', desc: 'Una semana consistente de registro.', oculto: false, criterio: (e) => (e.semanas_consistentes || 0) >= 1 },
  { code: 'racha_14', categoria: 'habito', nombre: 'Dos semanas', desc: '14 días seguidos de registro.', oculto: false, criterio: (e) => (e.racha || 0) >= 14 },
  // planificación / entreno / despensa
  { code: 'despensa_armada', categoria: 'planificacion', nombre: 'Despensa lista', desc: 'Sumaste 5 productos a tu despensa.', oculto: false, criterio: (e) => (e.despensa_items || 0) >= 5 },
  { code: 'primer_entreno', categoria: 'planificacion', nombre: 'A moverse', desc: 'Registraste tu primer entreno.', oculto: false, criterio: (e) => (e.entrenos || 0) >= 1 },
  // OCULTOS (§5): se revelan al desbloquear
  { code: 'constancia_total', categoria: 'habito', nombre: 'Imparable', desc: '60 días de registro. Leyenda del hábito.', oculto: true, criterio: (e) => (e.racha || 0) >= 60 },
  { code: 'sabio', categoria: 'aprendizaje', nombre: 'Sabio de la nutrición', desc: 'Completaste todas las lecciones disponibles.', oculto: true, criterio: (e) => (e.lecciones || 0) >= (e.lecciones_totales || 999) && (e.lecciones || 0) > 0 },
];

// ── Guardias TCA (Karpathy §0/§5). Umbrales recalibrables; el piso viene del motor (lib/nutrition). ──
export const RANGO = { INF: 0.85, SUP: 1.15, PROT_META: 0.90, UNDER_META: 0.70 };
