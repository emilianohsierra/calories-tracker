// Mascota (CoachOrb con vida) — DERIVADA 100% de la gamificación V1. PURA, determinista, $0, sin nueva
// fuente de verdad. Estados/copy CANÓNICOS de Karpathy (plan/mascota-catalogo.md §2), guardias TCA de
// gamificación (plan/mascota-seguridad-tca.md). Los 27 ESTADOS PROHIBIDOS (§3) son IMPOSIBLES por diseño:
// `animo` solo puede ser uno de los 6 permitidos; NO existe barra-de-vida/hambre/decaimiento/muerte/culpa
// en el modelo. UNDER_EATING hoy → comprensivo/cuidado (la mascota NUNCA celebra el día de comer poco).

// Los 6 estados PERMITIDOS (§2) con su prioridad de reposo (mayor gana; celebrando es transitorio aparte).
export const ANIMOS = ['celebrando', 'comprensivo', 'contento', 'animando', 'neutro_tranquilo', 'durmiendo'];
export const PRIORIDAD = { comprensivo: 80, contento: 60, animando: 40, neutro_tranquilo: 20, durmiendo: 10 };

// Etapas de evolución por NIVEL de conducta (cosmético; SOLO hacia adelante, nunca por peso ni regresión).
export const ETAPAS = [
  { min_nivel: 1, etapa: 'bebe', nombre: 'Orbe bebé' },
  { min_nivel: 2, etapa: 'joven', nombre: 'Orbe joven' },
  { min_nivel: 3, etapa: 'activo', nombre: 'Orbe activo' },
  { min_nivel: 4, etapa: 'experto', nombre: 'Orbe experto' },
  { min_nivel: 5, etapa: 'maestro', nombre: 'Orbe maestro' },
];

// Copy enlatado SEGURO por estado/submodo (verbatim del catálogo §2; fallback determinista sin IA).
const COPY = {
  celebrando: ['¡Lo lograste! Qué orgullo verte así.', '¡Nuevo logro! Tu constancia se nota.', '¡Eso! Un pasito más y sigues creciendo.'],
  contento: ['¡Bien! Registraste tu día, así se construye el hábito.', 'Me da gusto verte cuidándote hoy.', 'Llegaste a tu proteína, ¡vas muy bien!'],
  animando: ['¿Sumamos algo rico hoy?', 'Vamos por tu objetivo del día, yo te acompaño.', 'Un registro y seguimos juntos.'],
  comprensivo_recuperacion: ['¡Qué gusto verte! Retomamos juntos, un día no borra nada.', 'Aquí sigo contigo. Empezamos de nuevo cuando quieras.', 'Bienvenido de vuelta, seguimos a tu ritmo.'],
  comprensivo_cuidado: ['¿Comiste suficiente hoy? Súmate algo rico, unos huevos o un yogur.', 'Comer bien también es cuidarte; agrega algo que te guste.', 'Aquí estoy contigo. Si te quedaste corto, suma una comida rica.'],
  neutro_tranquilo: ['Aquí estoy contigo.', 'Cuando quieras, seguimos.', 'Todo a tu ritmo.'],
  durmiendo: ['Zzz… aquí estaré cuando vuelvas.', 'Descansando, sin prisa.', 'Nos vemos al rato.'],
};

const pick = (arr, idx) => (arr && arr.length ? arr[Math.abs(Number(idx) || 0) % arr.length] : '');

// Etapa (evolución) a partir del nivel. Monótona: nunca decrece.
export function etapaDeNivel(nivel) {
  const n = Math.max(1, Number(nivel) || 1);
  let e = ETAPAS[0];
  for (const et of ETAPAS) if (n >= et.min_nivel) e = et;
  return e;
}

// Estado de la mascota derivado del progreso (§2.1 resolución determinista). `estado`:
//   { nivel, racha, registroHoy, objetivoPendiente, rachaRota, celebracion, underEating, durmiendo }
// Devuelve { etapa, etapa_nombre, animo (∈ ANIMOS), submodo, reaccion, reposo, mensaje }.
export function estadoMascota(estado = {}) {
  const etapa = etapaDeNivel(estado.nivel);

  // MOOD DE REPOSO por prioridad (comprensivo 80 > contento 60 > animando 40 > neutro 20 > durmiendo 10).
  let reposo; let submodo = null; let copyKey;
  if (estado.underEating === true) { reposo = 'comprensivo'; submodo = 'cuidado'; copyKey = 'comprensivo_cuidado'; }       // REGLA DURA (80): comió de menos → cuidado, NUNCA feliz
  else if (estado.rachaRota) { reposo = 'comprensivo'; submodo = 'recuperacion'; copyKey = 'comprensivo_recuperacion'; }   // 80: recuperación sin culpa
  else if (estado.registroHoy || estado.proteinaEnMeta || estado.caloriasEnRango) { reposo = 'contento'; copyKey = 'contento'; } // 60: conducta sana hoy (guardias ya aplicadas)
  else if (estado.objetivoPendiente || estado.inicioSesion) { reposo = 'animando'; copyKey = 'animando'; }                 // 40
  else if (estado.durmiendo) { reposo = 'durmiendo'; copyKey = 'durmiendo'; }                                             // 10: nocturno/inactividad
  else { reposo = 'neutro_tranquilo'; copyKey = 'neutro_tranquilo'; }                                                     // 20: default, presente sin exigir

  // CELEBRANDO es TRANSITORIO (§2.1): se dispara por hito de conducta (nivel/logro/racha-hito) ENCIMA del
  // reposo, INCLUSO en un día UNDER_EATING (celebra el LOGRO/racha de REGISTRO, jamás la comida/peso).
  const celebra = !!estado.celebracion;
  const animo = celebra ? 'celebrando' : reposo;
  const copyFinal = celebra ? 'celebrando' : copyKey;

  return {
    etapa: etapa.etapa,
    etapa_nombre: etapa.nombre,
    animo,                                 // ∈ ANIMOS (6 permitidos; los 27 prohibidos son inalcanzables)
    submodo: celebra ? null : submodo,     // 'recuperacion' | 'cuidado' (solo en comprensivo)
    reaccion: celebra ? 'celebra' : null,  // animación puntual
    reposo,                                // mood de reposo bajo la celebración transitoria (para Rams)
    mensaje: pick(COPY[copyFinal] || COPY.neutro_tranquilo, estado.racha ?? estado.nivel),
  };
}
