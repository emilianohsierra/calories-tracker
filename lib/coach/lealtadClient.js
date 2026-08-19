// Cliente de LEALTAD (agradecimiento por seguir aquí, SIN presión). Consume el shape del CTO.
// Contrato acordado (confirmar): GET /api/coach/lealtad →
//   { meses_activo, meses_meta, recompensa, otorgada:boolean, mensaje? } | { lealtad: null } | null
// Tono: "gracias por seguir aquí"; NUNCA countdown / "reclama antes de que expire" / dark pattern.
// Deploy-safe: si falla / no existe / null → no se pinta la tarjeta (degrada). Mock SOLO en dev.

export async function getLealtad() {
  try {
    const res = await fetch('/api/coach/lealtad');
    if (res.ok) {
      const d = await res.json().catch(() => null);
      const l = d && (d.lealtad !== undefined ? d.lealtad : d);
      if (l && (l.meses_meta || l.otorgada)) return l;
      return null; // sin tramo activo → no se muestra nada
    }
  } catch {
    // sin backend
  }
  if (process.env.NODE_ENV === 'production') return null; // prod: degrada si aún no hay endpoint
  return { meses_activo: 4, meses_meta: 6, recompensa: '1 mes gratis', otorgada: false };
}
