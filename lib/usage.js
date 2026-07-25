// Helpers de cuota freemium. La fuente de verdad de la aplicación del límite vive en
// Postgres (funciones consumir_analisis / reembolsar_analisis + tabla app_config).
// Aquí solo se calcula el periodo para la UI y se arma el mensaje amigable.

const TZ = 'America/Mexico_City';
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Periodo mensual 'YYYY-MM' en la MISMA zona que la función SQL (evita ambigüedad, H13).
export function currentPeriod(date = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return ymd.slice(0, 7); // 'YYYY-MM'
}

// Etiqueta legible del próximo reinicio (1º del mes siguiente).
export function nextResetLabel(date = new Date()) {
  const [y, m] = currentPeriod(date).split('-').map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  return `1 de ${MESES[nextMonth - 1]}`;
}

// Mensaje del 429 según el motivo devuelto por consumir_analisis.
export function limitMessage(reason, date = new Date()) {
  if (reason === 'user_limit') {
    return `Llegaste a tu límite de análisis con IA de este mes. Se reinicia el ${nextResetLabel(date)}. Mientras tanto, puedes registrar tu comida manualmente (es gratis).`;
  }
  if (reason === 'kill_switch' || reason === 'global_cap') {
    return 'El análisis con IA no está disponible en este momento. Puedes registrar tu comida manualmente (es gratis).';
  }
  return 'No se pudo verificar tu cuota. Intenta de nuevo.';
}
