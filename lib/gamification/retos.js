// Gamificación V2.1 — RETOS (config en código + helpers PUROS, deterministas, 0 IA). Patrón de
// config.js/eventos.js: editable por PR (revisión TCA de Karpathy + copy Drucker/Lugia), deploy-safe.
//
// LÍNEA ROJA TCA (Karpathy, plan/gamificacion-v2-tca.md): un reto SOLO premia CONDUCTA sana
// (registrar / aprender / agua / entrenar / EN RANGO / despensa / proteína aditiva). PROHIBIDO por
// diseño: comer menos, déficit, bajar de peso, saltarse comidas, ayuno, restricción, o competir por
// peso/calorías. La whitelist de tipos es CERRADA; el copy pasa el filtro `copySeguro`.
import { EVENTOS } from './eventos';

// ── WHITELIST CERRADA de tipos de conducta (nada fuera de aquí puede ser un reto). ──
export const RETO_TIPOS = Object.freeze({
  REGISTRAR_DIAS: 'registrar_dias',
  COMPLETAR_LECCIONES: 'completar_lecciones',
  TOMAR_AGUA: 'tomar_agua',
  ENTRENAR: 'entrenar',
  EN_RANGO_DIAS: 'en_rango_dias',
  PLANEAR_DESPENSA: 'planear_despensa',
  CUMPLIR_PROTEINA: 'cumplir_proteina',
});
export const RETO_TIPOS_PERMITIDOS = new Set(Object.values(RETO_TIPOS));

export const PERIODOS = Object.freeze({ DIARIO: 'diario', SEMANAL: 'semanal' });

// Métricas de estado GUARDADAS (día-conteo) que alimentan retos de nutrición (config.js estado):
//   rango_dias (EN RANGO, guardado por enRangoKcal/underEating) · prot_meta_dias (proteína aditiva ≥90%).
export const RETO_METRICAS = new Set(['rango_dias', 'prot_meta_dias']);

// Intents PROHIBIDOS por diseño — se usan para VALIDAR que ningún reto/copy cruce la línea roja.
export const RETO_INTENTS_PROHIBIDOS = Object.freeze([
  'peso', 'bascula', 'kilos', 'kg', 'deficit', 'ayuno', 'ayunar', 'restriccion', 'restringir',
  'detox', 'competir', 'comer menos', 'come menos', 'comer poco', 'bajar de peso', 'baja de peso',
  'perder peso', 'saltarse', 'salta la', 'quien come menos',
]);

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
// Regex de intents prohibidos con LÍMITES DE PALABRA (evita falsos positivos tipo 'desayuno'→'ayuno').
const RE_PROHIBIDO = /\b(peso|bascula|kilos?|kg|deficit|ayun\w*|restring\w*|restriccion|detox|competir|comer menos|come menos|comer poco|bajar de peso|baja de peso|perder peso|saltarse|salta la|quien come menos)\b/;
// copySeguro(texto) → true si el texto NO contiene un intent prohibido (línea roja TCA).
export function copySeguro(texto) {
  return !RE_PROHIBIDO.test(norm(texto));
}

// ── CATÁLOGO de retos (config). Cada uno: id, tipo (whitelist), periodo, meta (conteo), eventos (de
//    EVENTOS de V1 que suman progreso) y/o metrica (día-conteo guardada), titulo, descripcion. ──
export const RETOS = [
  // ---- DIARIOS ----
  { id: 'diario_registrar', tipo: RETO_TIPOS.REGISTRAR_DIAS, periodo: PERIODOS.DIARIO, meta: 1, ventana_dias: 1, eventos: [EVENTOS.DAY_COMPLETED], titulo: 'Registra tu día', descripcion: 'Registra al menos una comida hoy.' },
  { id: 'diario_agua', tipo: RETO_TIPOS.TOMAR_AGUA, periodo: PERIODOS.DIARIO, meta: 1, ventana_dias: 1, eventos: [EVENTOS.CHECKIN_COMPLETED], titulo: 'Toma tu agua', descripcion: 'Haz tu check-in de hidratación de hoy.' },
  { id: 'diario_leccion', tipo: RETO_TIPOS.COMPLETAR_LECCIONES, periodo: PERIODOS.DIARIO, meta: 1, ventana_dias: 1, eventos: [EVENTOS.LESSON_COMPLETED], titulo: 'Aprende algo hoy', descripcion: 'Completa una micro-lección.' },
  { id: 'diario_proteina', tipo: RETO_TIPOS.CUMPLIR_PROTEINA, periodo: PERIODOS.DIARIO, meta: 1, ventana_dias: 1, metrica: 'prot_meta_dias', titulo: 'Suma tu proteína', descripcion: 'Llega a tu meta de proteína de hoy.' },
  { id: 'diario_despensa', tipo: RETO_TIPOS.PLANEAR_DESPENSA, periodo: PERIODOS.DIARIO, meta: 1, ventana_dias: 1, eventos: [EVENTOS.PANTRY_ITEM_ADDED], titulo: 'Surte tu despensa', descripcion: 'Agrega un producto a tu despensa.' },
  { id: 'diario_entreno', tipo: RETO_TIPOS.ENTRENAR, periodo: PERIODOS.DIARIO, meta: 1, ventana_dias: 1, eventos: [EVENTOS.WORKOUT_LOGGED], titulo: 'A moverte', descripcion: 'Registra tu entreno de hoy.' },
  { id: 'diario_rango', tipo: RETO_TIPOS.EN_RANGO_DIAS, periodo: PERIODOS.DIARIO, meta: 1, ventana_dias: 1, metrica: 'rango_dias', titulo: 'En tu rango', descripcion: 'Mantente en tu rango de energía hoy (ni de más, ni de menos).' },

  // ---- SEMANALES ----
  { id: 'semanal_registrar_5', tipo: RETO_TIPOS.REGISTRAR_DIAS, periodo: PERIODOS.SEMANAL, meta: 5, ventana_dias: 7, eventos: [EVENTOS.DAY_COMPLETED], titulo: '5 días esta semana', descripcion: 'Registra 5 días de los 7.' },
  { id: 'semanal_lecciones_3', tipo: RETO_TIPOS.COMPLETAR_LECCIONES, periodo: PERIODOS.SEMANAL, meta: 3, ventana_dias: 7, eventos: [EVENTOS.LESSON_COMPLETED], titulo: 'Tres lecciones', descripcion: 'Completa 3 lecciones esta semana.' },
  { id: 'semanal_agua_5', tipo: RETO_TIPOS.TOMAR_AGUA, periodo: PERIODOS.SEMANAL, meta: 5, ventana_dias: 7, eventos: [EVENTOS.CHECKIN_COMPLETED], titulo: 'Hidrátate la semana', descripcion: 'Haz tu check-in de agua 5 días.' },
  { id: 'semanal_entrenos_3', tipo: RETO_TIPOS.ENTRENAR, periodo: PERIODOS.SEMANAL, meta: 3, ventana_dias: 7, eventos: [EVENTOS.WORKOUT_LOGGED], titulo: 'Tres entrenos', descripcion: 'Registra 3 entrenos esta semana.' },
  { id: 'semanal_rango_5', tipo: RETO_TIPOS.EN_RANGO_DIAS, periodo: PERIODOS.SEMANAL, meta: 5, ventana_dias: 7, metrica: 'rango_dias', titulo: 'En rango 5 días', descripcion: 'Mantente en tu rango de energía 5 días (ni de más, ni de menos).' },
  { id: 'semanal_proteina_5', tipo: RETO_TIPOS.CUMPLIR_PROTEINA, periodo: PERIODOS.SEMANAL, meta: 5, ventana_dias: 7, metrica: 'prot_meta_dias', titulo: 'Proteína la semana', descripcion: 'Llega a tu meta de proteína 5 días.' },
  { id: 'semanal_despensa_3', tipo: RETO_TIPOS.PLANEAR_DESPENSA, periodo: PERIODOS.SEMANAL, meta: 3, ventana_dias: 7, eventos: [EVENTOS.PANTRY_ITEM_ADDED], titulo: 'Surte para la semana', descripcion: 'Agrega 3 productos a tu despensa.' },
];

// ── Pools para AUTO-ASIGNAR 1 diario + 1 semanal (el CTO elige por seed determinista, sin azar). ──
export const POOL_DIARIO = RETOS.filter((r) => r.periodo === PERIODOS.DIARIO).map((r) => r.id);
export const POOL_SEMANAL = RETOS.filter((r) => r.periodo === PERIODOS.SEMANAL).map((r) => r.id);

// ── Helpers PUROS ──
export function retoPorId(id) {
  return RETOS.find((r) => r.id === id) || null;
}
export function retosDiarios() {
  return RETOS.filter((r) => r.periodo === PERIODOS.DIARIO);
}
export function retosSemanales() {
  return RETOS.filter((r) => r.periodo === PERIODOS.SEMANAL);
}
// ¿un reto es SEGURO y bien formado? tipo en whitelist, eventos ⊆ EVENTOS o metrica válida, copy limpio.
export function retoEsSeguro(reto) {
  if (!reto || typeof reto !== 'object') return false;
  if (!RETO_TIPOS_PERMITIDOS.has(reto.tipo)) return false;
  const evs = Array.isArray(reto.eventos) ? reto.eventos : [];
  const evsOk = evs.every((e) => Object.values(EVENTOS).includes(e));
  const metOk = reto.metrica == null || RETO_METRICAS.has(reto.metrica);
  if (!evsOk || !metOk) return false;
  if (evs.length === 0 && reto.metrica == null) return false; // debe alimentarse de algo
  if (!(Number(reto.meta) > 0)) return false;
  return copySeguro(reto.titulo) && copySeguro(reto.descripcion);
}
// Valida TODO el catálogo → lista de problemas (vacía = OK). Para test/CI (línea roja).
export function validarCatalogo() {
  const problemas = [];
  const ids = new Set();
  for (const r of RETOS) {
    if (ids.has(r.id)) problemas.push(`id duplicado: ${r.id}`);
    ids.add(r.id);
    if (!retoEsSeguro(r)) problemas.push(`reto inseguro/mal formado: ${r.id}`);
    if (![PERIODOS.DIARIO, PERIODOS.SEMANAL].includes(r.periodo)) problemas.push(`periodo inválido: ${r.id}`);
  }
  return problemas;
}
// Selección determinista (sin azar): pool[seed % pool.length]. seed = índice del día/semana (lo da el CTO).
function elegir(pool, seed) {
  if (!pool.length) return null;
  const i = ((Math.trunc(Number(seed) || 0) % pool.length) + pool.length) % pool.length;
  return retoPorId(pool[i]);
}
export function elegirDiario(seed) {
  return elegir(POOL_DIARIO, seed);
}
export function elegirSemanal(seed) {
  return elegir(POOL_SEMANAL, seed);
}

// ── Banco de copy del CHECK-IN (§2): caritas 1-5 CUALITATIVAS (ánimo/energía), SIN números de cuerpo. ──
export const CHECKIN = {
  animo: {
    pregunta: '¿Cómo te sentiste hoy?',
    // índice 0..4 = carita 1..5 (cualitativo, jamás peso/medidas)
    caritas: ['Muy mal', 'Un poco mal', 'Normal', 'Bien', 'Muy bien'],
  },
  energia: {
    pregunta: '¿Con qué energía andas?',
    caritas: ['Sin energía', 'Con poca', 'Normal', 'Con energía', 'A tope'],
  },
  gracias: [
    'Gracias por tomarte un momento para ti.',
    'Bien hecho por escucharte hoy.',
    'Registrar cómo te sientes también es cuidarte.',
  ],
};

// ── Banco de copy de NOTIFICACIONES (§4): SOLO positivas. PROHIBIDO 'no registraste/fallaste', nags de
//    comer/no-comer y presión de racha ansiógena. Opt-out y anti-spam los maneja el motor de notif. ──
export const NOTIF = {
  reto_por_cerrar: [
    'Estás a nada de cerrar tu reto de hoy.',
    'Un pasito más y completas tu reto.',
  ],
  racha_dia_gracia: [
    '¿Registramos algo hoy? Tienes un día de gracia por si acaso.',
    'Un registro y sigues con tu racha; hay día de gracia si lo necesitas.',
  ],
  logro: [
    '¡Desbloqueaste un logro! Tu constancia se nota.',
    '¡Nuevo logro! Vas muy bien.',
  ],
  nivel: [
    '¡Subiste de nivel! Sigue así.',
    'Nuevo nivel desbloqueado, felicidades por tu hábito.',
  ],
  reengagement_suave: [
    'Qué gusto verte por aquí. ¿Registramos algo hoy?',
    'Aquí estamos cuando quieras retomar, a tu ritmo.',
  ],
};
