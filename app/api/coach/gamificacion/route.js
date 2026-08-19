import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { localDateTime } from '@/lib/coach/context';
import { calcularRacha } from '@/lib/coach/triggers';
import { nivelDe, logroMeta } from '@/lib/gamification/eventos';
import { LOGROS } from '@/lib/gamification/config';
import { objetivosDelDia, siguienteAccion, progresoDia } from '@/lib/gamification/dia';
import { estadoMascota } from '@/lib/gamification/mascota';
import { GAMIFICACION_ON } from '@/lib/gamification/otorgar';

const MASCOTA_ON = process.env.MASCOTA_ON === '1';

// Coach · Gamificación V1 (read). GET → estado de 'Hoy' + Mi Progreso (contrato de Rams). DETERMINISTA,
// $0. 'Hoy'/siguiente-acción se CALCULAN del estado real (pendientes del motor); la racha se computa de
// meals.date (fuente canónica, reusa calcularRacha). Deploy-safe: flag off / tablas ausentes → secciones
// null/vacías → la HOME degrada intacta.
export const runtime = 'nodejs';

const VACIO = { siguiente_accion: null, objetivo_hoy: [], progreso: null, racha: null, xp: null, logros: [], mascota: null, semanal: null, celebracion: null };
const restarDias = (fecha, n) => { const d = new Date(`${fecha}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    if (!GAMIFICACION_ON) return NextResponse.json(VACIO); // apagado → HOME intacta

    const { date: hoy } = localDateTime();
    const uid = user.id;

    // Lecturas en paralelo, cada una deploy-safe (tabla ausente → default).
    const [perfil, targets, mealsHoy, hist, dayState, progreso, logrosRows] = await Promise.all([
      supabase.from('nutrition_profiles').select('coach_params, allergies').eq('user_id', uid).maybeSingle().then((r) => r.data).catch(() => null),
      supabase.from('nutrition_targets').select('protein_g, water_ml, kcal_target').eq('user_id', uid).maybeSingle().then((r) => r.data).catch(() => null),
      supabase.from('meals').select('protein_g, calories').eq('user_id', uid).eq('date', hoy).then((r) => r.data).catch(() => null),
      supabase.from('meals').select('date').eq('user_id', uid).gte('date', restarDias(hoy, 40)).then((r) => r.data).catch(() => null),
      supabase.from('coach_day_state').select('agua_ml').eq('user_id', uid).eq('date', hoy).maybeSingle().then((r) => r.data).catch(() => null),
      supabase.from('user_progress').select('xp_total').eq('user_id', uid).maybeSingle().then((r) => r.data).catch(() => null),
      supabase.from('user_achievements').select('logro_code, unlocked_at').eq('user_id', uid).order('unlocked_at', { ascending: false }).then((r) => r.data).catch(() => null),
    ]);

    // ¿lección hoy? (education_progress ultimo_visto = hoy). Deploy-safe.
    let leccionHoy = false;
    try {
      const { data } = await supabase.from('education_progress').select('concepto').eq('user_id', uid).eq('ultimo_visto', hoy).limit(1);
      leccionHoy = !!(data && data.length);
    } catch { leccionHoy = false; }

    // OBJETIVO DEL DÍA + SIGUIENTE ACCIÓN (del estado real).
    const protHoy = (mealsHoy || []).reduce((a, m) => a + (m.protein_g || 0), 0);
    const objetivo_hoy = objetivosDelDia({
      n_comidas: (mealsHoy || []).length,
      prot: protHoy, protTarget: targets?.protein_g || null,
      agua: dayState?.agua_ml ?? null, aguaMeta: targets?.water_ml || null,
      leccionHoy,
    });
    const siguiente_accion = siguienteAccion(objetivo_hoy);
    const progresoHoy = progresoDia(objetivo_hoy);

    // RACHA (de registro; fuente = meals.date, reusa calcularRacha). Recuperación sin culpa si se rompió.
    const fechas = new Set((hist || []).map((m) => m.date));
    const { rachaHoy, rachaAyer, registroHoy } = calcularRacha(fechas, hoy);
    const dias = registroHoy ? rachaHoy : rachaAyer;
    const rota = !registroHoy && rachaAyer === 0 && fechas.size > 0; // hubo actividad antes, hoy/ayer sin registro
    const racha = {
      dias,
      congelada: false, // día de gracia lo marca el cron (user_streaks); V1 read no lo fuerza
      recuperacion: rota ? 'Un día no borra tu progreso. Retomas hoy y seguimos.' : null,
    };

    // XP / NIVEL (nivel computado en JS; nombre renombrable).
    const xpTotal = progreso?.xp_total || 0;
    const nv = nivelDe(xpTotal);
    const xp = { nivel: nv.n, nombre: nv.nombre, xp: xpTotal, meta: nv.siguiente ? nv.siguiente.min : xpTotal };

    // LOGROS: catálogo (config) + desbloqueos. Ocultos NO revelados hasta desbloquear (nombre '???').
    const desbloqueados = new Map((logrosRows || []).map((r) => [r.logro_code, r.unlocked_at]));
    const logros = LOGROS.map((l) => {
      const desbloqueado = desbloqueados.has(l.code);
      const velado = l.oculto && !desbloqueado;
      return {
        id: l.code, categoria: l.categoria, oculto: !!l.oculto, desbloqueado,
        nombre: velado ? '???' : l.nombre,
        descripcion: velado ? 'Logro oculto — sigue jugando para descubrirlo.' : l.desc,
      };
    });

    // CELEBRACIÓN: el desbloqueo más reciente (id estable). Rams lo muestra 1× (guard localStorage por id).
    let celebracion = null;
    const ultimo = (logrosRows || [])[0];
    if (ultimo) {
      const meta = logroMeta(ultimo.logro_code);
      if (meta) celebracion = { tipo: 'logro', texto: `¡Logro desbloqueado: ${meta.nombre}!`, id: `logro:${ultimo.logro_code}` };
    }

    // MASCOTA (derivada 100% del progreso; flag MASCOTA_ON). underEating = proxy 0.70·kcal_target (TCA:
    // un día comiendo de menos NO la pone feliz → cuidado cálido). Deploy-safe: flag off → mascota:null.
    let mascota = null;
    if (MASCOTA_ON) {
      const kcalHoy = (mealsHoy || []).reduce((a, m) => a + (m.calories || 0), 0);
      const under = (mealsHoy || []).length > 0 && targets?.kcal_target > 0 && kcalHoy < 0.70 * targets.kcal_target;
      mascota = estadoMascota({
        nivel: nv.n, racha: dias, registroHoy, objetivoPendiente: !!siguiente_accion,
        rachaRota: rota, celebracion, underEating: under,
      });
    }

    return NextResponse.json({ siguiente_accion, objetivo_hoy, progreso: progresoHoy, racha, xp, logros, mascota, semanal: null, celebracion });
  } catch (err) {
    console.error('gamificacion GET EXCEPCIÓN:', err?.message);
    return NextResponse.json(VACIO); // nunca rompe la HOME
  }
}
