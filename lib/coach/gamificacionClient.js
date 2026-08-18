// Cliente de Gamificación V1. Consume el endpoint que edita el CTO en paralelo. La UI NO inventa:
// todo (acción, objetivo del día, racha, XP/nivel, logros, semanal) viene del backend determinista.
// REGLAS: nunca peso como vara de progreso; tono motivador sin casino. Deploy-safe: si el endpoint
// falla / flag off / no trae datos → null → la sección degrada (no rompe HOME).
//
// Contrato acordado (confirmar con CTO):
//   GET /api/coach/gamificacion →
//   {
//     siguiente_accion: { titulo, descripcion?, cta:{ label, accion?, ruta? } } | null,  // el HÉROE
//     objetivo_hoy: [{ id, label, hecho:boolean, accion? }],                              // lista marcable
//     progreso: { hechas, total },
//     racha: { dias, congelada?:boolean, recuperacion?:string|null },   // recuperacion = mensaje SIN culpa
//     xp: { nivel, nombre, xp, meta },                                  // barra xp/meta hacia el siguiente
//     logros: [{ id, nombre, descripcion, categoria, desbloqueado:boolean, oculto:boolean, icono? }],
//     semanal?: { insights:[string], foco?:string },                   // resumen semanal SIN culpa
//     celebracion?: { tipo:'nivel'|'logro'|'racha', texto } | null      // celebración ligera pendiente
//   }

async function jsonGet(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return await r.json().catch(() => null); }
  catch { return null; }
}

export async function getGamificacion() {
  const d = await jsonGet('/api/coach/gamificacion');
  if (d && (d.xp || d.siguiente_accion || Array.isArray(d.objetivo_hoy))) return d;
  if (process.env.NODE_ENV === 'production') return d || null; // prod: degrada si aún no hay endpoint
  return mock();
}

// Mock SÓLO para dev (sin backend). No se usa en producción.
function mock() {
  return {
    siguiente_accion: { titulo: 'Registra tu desayuno', descripcion: 'Con una foto basta — yo estimo lo demás.', cta: { label: 'Registrar', accion: 'registrar' } },
    objetivo_hoy: [
      { id: 'desayuno', label: 'Registrar desayuno', hecho: true, accion: 'registrar' },
      { id: 'comida', label: 'Registrar comida', hecho: false, accion: 'registrar' },
      { id: 'cena', label: 'Registrar cena', hecho: false, accion: 'registrar' },
      { id: 'checkin', label: 'Check-in del día', hecho: false, accion: 'checkin' },
    ],
    progreso: { hechas: 1, total: 4 },
    racha: { dias: 6, congelada: false, recuperacion: null },
    xp: { nivel: 3, nombre: 'Constante', xp: 120, meta: 200 },
    logros: [
      { id: 'primer_registro', nombre: 'Primer registro', descripcion: 'Registraste tu primera comida.', categoria: 'Primeros pasos', desbloqueado: true, oculto: false, icono: 'check' },
      { id: 'racha7', nombre: '7 días seguidos', descripcion: 'Una semana registrando sin falta.', categoria: 'Consistencia', desbloqueado: true, oculto: false, icono: 'flame' },
      { id: 'proteina10', nombre: 'Proteína x10', descripcion: 'Cumpliste tu proteína 10 veces.', categoria: 'Nutrición', desbloqueado: false, oculto: false, icono: 'activity' },
      { id: 'primer_coach', nombre: 'Primera charla', descripcion: 'Hablaste con tu coach.', categoria: 'Coach', desbloqueado: false, oculto: false, icono: 'message' },
      { id: 'oculto1', nombre: '', descripcion: 'Logro por descubrir.', categoria: 'Sorpresa', desbloqueado: false, oculto: true },
      { id: 'oculto2', nombre: '', descripcion: 'Logro por descubrir.', categoria: 'Sorpresa', desbloqueado: false, oculto: true },
    ],
    semanal: { insights: ['Cumpliste tu proteína 5 de 7 días.', 'Registraste los 7 días — tu mejor semana.'], foco: 'Esta semana, suma verdura en 3 comidas.' },
    celebracion: null,
  };
}
