// Cliente de CHECK-IN (Gamificación V2.1). Estado de hoy vía GET /api/coach/checkin y envío vía
// POST /api/coach/checkin → RPC registrar_checkin (lo construye Ford). Deploy-safe: 404 / v2-off →
// getCheckinHoy() devuelve null → el widget se OCULTA. Distingue:
//   null                         → sin endpoint / v2 off → ocultar
//   { hecho:false }              → v2 on, aún no hay check-in hoy → mostrar selector de caritas
//   { hecho:true, animo, energia}→ ya registrado hoy (1/día) → estado de agradecimiento
// Shape del POST = { animo, energia } (RPC registrar_checkin(p_animo text, p_energia smallint)).

export async function getCheckinHoy() {
  try {
    const res = await fetch('/api/coach/checkin');
    if (res.ok) {
      const d = await res.json().catch(() => null);
      const c = d && (d.checkin !== undefined ? d.checkin : d);
      if (c && typeof c === 'object') {
        if (c.hecho || c.animo || c.energia != null) {
          return { hecho: true, animo: c.animo ?? null, energia: c.energia ?? null };
        }
      }
      return { hecho: false }; // endpoint vivo, sin check-in hoy
    }
  } catch {
    // sin backend
  }
  if (process.env.NODE_ENV === 'production') return null; // prod: sin endpoint → ocultar
  return { hecho: false }; // dev: previsualizar el selector
}

export async function enviarCheckin({ animo, energia }) {
  try {
    const res = await fetch('/api/coach/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ animo, energia }),
    });
    return res.ok;
  } catch {
    return false; // el widget ya mostró el agradecimiento optimista; el reintento vive en Fase 2+
  }
}
