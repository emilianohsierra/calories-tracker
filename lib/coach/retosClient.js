// Cliente de RETOS (Gamificación V2.1). Consume GET /api/coach/retos (lo construye el CTO).
// Deploy-safe: 404 / vacío / v2-off / sin migración → devuelve null → los componentes se OCULTAN
// (mismo patrón que la tarjeta de lealtad). Tolerante al shape: acepta { retos:{diario,semanal} },
// { retos:[...] } o [...]; normaliza a { diario, semanal }. Contrato asumido (arquitectura
// challenge_progress + lib/gamification/retos.js): reto = { code, titulo, cadencia|base:'diario'|'semanal',
// progreso, meta, estado:'activo'|'completado', xp? }. Si el CTO fija otras claves → se ajusta aquí.

function esDiario(r) {
  const c = String(r.cadencia || r.base || r.periodo || '').toLowerCase();
  return c === 'diario' || c === 'dia' || c === 'daily' || c === 'day';
}

function normalizar(d) {
  if (!d) return null;
  const raw = d.retos !== undefined ? d.retos : d;
  if (!raw) return null;
  let diario = null;
  let semanal = null;
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (!r || !r.titulo) continue;
      if (esDiario(r)) { if (!diario) diario = { ...r, cadencia: 'diario' }; }
      else if (!semanal) semanal = { ...r, cadencia: 'semanal' };
    }
  } else if (typeof raw === 'object') {
    if (raw.diario?.titulo) diario = { ...raw.diario, cadencia: 'diario' };
    if (raw.semanal?.titulo) semanal = { ...raw.semanal, cadencia: 'semanal' };
  }
  if (!diario && !semanal) return null;
  return { diario, semanal };
}

export async function getRetos() {
  try {
    const res = await fetch('/api/coach/retos');
    if (res.ok) {
      const d = await res.json().catch(() => null);
      return normalizar(d); // null si no hay retos activos
    }
  } catch {
    // sin backend
  }
  if (process.env.NODE_ENV === 'production') return null; // prod: degrada si aún no hay endpoint
  // Mock SOLO en dev para previsualizar el montaje (Fase 2 lo reemplaza con datos reales del CTO).
  return {
    diario: { code: 'reg_3_comidas', titulo: 'Registra tus 3 comidas hoy', cadencia: 'diario', progreso: 2, meta: 3, estado: 'activo', xp: 10 },
    semanal: { code: 'proteina_5d', titulo: '5 de 7 días con tu proteína cumplida', cadencia: 'semanal', progreso: 3, meta: 5, estado: 'activo', xp: 30 },
  };
}
