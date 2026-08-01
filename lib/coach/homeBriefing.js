// Interfaz con el "cerebro" del coach (Karpathy).
// Contrato REAL del endpoint GET /api/coach/home-briefing (server = fuente de verdad):
//   {
//     date,
//     coach:            { id, nombre, icono } | null,
//     entrenoDelDia:    { title, when } | null,
//     macrosObjetivo:   { kcal, protein_g, carbs_g, fat_g, fiber_g, water_ml } | null,
//     macrosConsumidos: { kcal, protein_g, carbs_g, fat_g },
//     pendientes:       { kcal, protein_g, carbs_g, fat_g } | null,
//     progreso:         { kcalPct, protPct } | null,   // NO se usa: el % se calcula en vivo
//     coachLine:        string
//   }
// Los campos llegan null cuando no hay datos → BriefingCard cae a estado vacío.
// La UI se cablea a esta forma pero NO se bloquea si el endpoint aún no existe:
// fetchHomeBriefing() devuelve null y la HOME usa buildFallbackBriefing() con los
// datos que ya tiene (targets del plan + totals del día).

export async function fetchHomeBriefing() {
  try {
    const res = await fetch('/api/coach/home-briefing');
    if (!res.ok) return null;
    const data = await res.json();
    // Validación mínima de forma: si no trae lo esperado, tratamos como ausente.
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null; // sin red / endpoint inexistente → fallback determinista
  }
}

// Fallback 100% local (0 IA): sintetiza la forma del contrato desde el plan y lo consumido
// hoy. Deja macrosObjetivo/macrosConsumidos en null para que BriefingCard los derive de
// targets+totals (única convención de claves) y solo aporta la coachLine determinista.
export function buildFallbackBriefing({ targets, totals } = {}) {
  if (!targets) return null;
  const objKcal = Math.round(targets.kcal_target || 0);
  const objProt = Math.round(targets.protein_g || 0);
  const conKcal = Math.round(totals?.calories || 0);
  const conProt = Math.round(totals?.protein_g || 0);
  const protPend = Math.max(0, objProt - conProt);
  const kcalPend = Math.max(0, objKcal - conKcal);

  let coachLine;
  if (objKcal > 0 && conKcal === 0) {
    coachLine = 'Empecemos el día: registra tu primera comida y te voy guiando.';
  } else if (kcalPend <= 0) {
    coachLine = 'Cerraste tu día en tu meta. Buen trabajo — descansa.';
  } else if (protPend > 0) {
    coachLine = `Vas bien. Te faltan ${protPend} g de proteína; una cena con pollo, huevo o frijol cierra tu día.`;
  } else {
    coachLine = `Vas bien: te quedan ${kcalPend} kcal para tu meta de hoy.`;
  }

  return { entrenoDelDia: null, macrosObjetivo: null, macrosConsumidos: null, coachLine };
}
