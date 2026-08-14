// Cliente del Consejo del Día. Schema del backend (Drucker §2):
//   { foco, titulo, cuerpo, dato_motor?:{label,valor}, cta?:{label,accion} }
// Regla dura: la UI NO inventa contenido nutricional; el consejo REAL viene del backend.
// Deploy-safe: si el endpoint falla/no existe → fallback GENÉRICO seguro (nunca vacío, sin PII,
// sin cifras inventadas). En dev (sin backend) se muestra un mock para probar el visual.

export async function getConsejo() {
  try {
    const res = await fetch('/api/coach/consejo');
    if (res.ok) {
      const d = await res.json().catch(() => null);
      const c = d?.consejo || d;
      if (c && (c.titulo || c.cuerpo)) return c;
    }
  } catch {
    // red/backend caído → fallback
  }
  return process.env.NODE_ENV === 'production' ? null : mockConsejo();
}

// Fallback GENÉRICO (Drucker §7 "nunca vacío"): copy de bienvenida, sin datos personales ni
// cifras. NO es contenido nutricional inventado; es el estado de degradación seguro.
export function fallbackConsejo() {
  return {
    foco: 'bienvenida',
    titulo: 'Un paso a la vez',
    cuerpo: 'Registra tu primera comida de hoy — con una foto basta. Yo te acompaño con el resto.',
  };
}

// Mock SOLO para dev (no producción): permite ver el hero y el compartir sin backend.
function mockConsejo() {
  return {
    foco: 'racha',
    titulo: 'Vas por la racha',
    cuerpo: 'Varios días registrando seguidos. El hábito ya está tomando forma; un día más y lo consolidas.',
    dato_motor: { label: 'Racha', valor: '6 días' },
    cta: { label: 'Ver mi progreso', accion: 'ver_progreso' },
  };
}
