import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { localDateTime } from '@/lib/coach/context';
import { retosActivo } from '@/lib/gamification/v2';
import { retosActivosDe } from '@/lib/gamification/retosCron';

// Coach · Retos V2.1 (READ). GET → los 2 retos ACTIVOS del usuario (1 diario + 1 semanal, deterministas) +
// su progreso REAL (challenge_progress, calculado por el cron). El cliente NUNCA reporta progreso.
// Deploy-safe: V2 off / kill / tabla ausente → { retos: [] } → la sección se oculta, HOME intacta.
export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    if (!(await retosActivo(supabase))) return NextResponse.json({ retos: [] }); // flag off / kill → vacío

    const { date: hoy } = localDateTime();
    const activos = retosActivosDe(hoy); // [{ reto, periodo }] — 1 diario + 1 semanal

    // Progreso del usuario (deploy-safe: tabla ausente / error → sin progreso).
    let progresos = [];
    try {
      const ids = activos.map((a) => a.reto.id);
      const { data } = await supabase.from('challenge_progress')
        .select('challenge_id, periodo, progreso, meta, estado')
        .eq('user_id', user.id).in('challenge_id', ids);
      progresos = data || [];
    } catch { progresos = []; }
    const pMap = new Map(progresos.map((p) => [`${p.challenge_id}@${p.periodo}`, p]));

    const retos = activos.map(({ reto, periodo }) => {
      const p = pMap.get(`${reto.id}@${periodo}`);
      return {
        id: reto.id, tipo: reto.tipo, periodo: reto.periodo, titulo: reto.titulo, descripcion: reto.descripcion,
        meta: reto.meta, progreso: Math.min(p?.progreso || 0, reto.meta), completo: p?.estado === 'completado',
      };
    });
    return NextResponse.json({ retos });
  } catch (err) {
    console.error('retos GET EXCEPCIÓN:', err?.message);
    return NextResponse.json({ retos: [] }); // nunca rompe la HOME
  }
}
