// Cliente de LEALTAD (agradecimiento por antigüedad, permanente y automático — SIN presión).
// Contrato canónico (Lugia/CTO) GET /api/coach/lealtad →
//   { pro_since:ISO|null, meses_pro:number,
//     proximo_tramo:{ code, meses, faltan, meses_gratis }|null,
//     otorgados:[{ tramo_code, meses_gratis, otorgado_en }] } | null
// Tono: "gracias por seguir aquí"; NUNCA cuenta-regresiva / urgencia / dark pattern.
// Deploy-safe: 404 / null / {} / sin tramo ni otorgados → devolvemos null (la tarjeta se OCULTA).
// Mock SOLO en dev.
export async function getLealtad() {
  try {
    const res = await fetch('/api/coach/lealtad');
    if (res.ok) {
      const d = await res.json().catch(() => null);
      const l = d && typeof d === 'object' && d.lealtad !== undefined ? d.lealtad : d;
      if (!l || typeof l !== 'object') return null;
      const tramo = l.proximo_tramo || null;
      const otorgados = Array.isArray(l.otorgados) ? l.otorgados : [];
      // {} vacío o sin nada que mostrar → oculta
      if (!tramo && otorgados.length === 0) return null;
      return { pro_since: l.pro_since ?? null, meses_pro: Number(l.meses_pro) || 0, proximo_tramo: tramo, otorgados };
    }
    return null; // 404 u otro → oculta
  } catch {
    // sin backend
  }
  if (process.env.NODE_ENV === 'production') return null; // prod: degrada si aún no hay endpoint
  return {
    pro_since: '2026-04-19T00:00:00.000Z',
    meses_pro: 4,
    proximo_tramo: { code: 'tramo_6m', meses: 6, faltan: 2, meses_gratis: 1 },
    otorgados: [],
  };
}
