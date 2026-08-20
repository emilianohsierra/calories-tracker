// Gamificación V2.1 · S1 — RETOS backend (server-only, en el cron). Recalcula challenge_progress desde el
// LEDGER (gamification_events) + métricas derivadas (rango_dias/prot_meta_dias, del motor); al completar,
// otorga vía otorgar_evento (service_role). El cliente NUNCA reporta progreso (frontera de confianza V1).
import { retoPorId, elegirDiario, elegirSemanal, PERIODOS } from './retos';
import { pisoSeguridad, enRangoKcal, proteinaEnMeta } from './eventos';

// XP por periodo (config recalibrable; retos.js -Karpathy- no fija xp → lo define el CTO server-side).
export const RETO_XP = Object.freeze({ diario: 20, semanal: 60 });
export function xpDeReto(reto) { return (reto && RETO_XP[reto.periodo]) || 0; }

// Índice determinista del día (para elegirDiario) y semana ISO 'YYYY-Www' (periodo + seed semanal).
export function diaDelAno(fecha) {
  const d = new Date(`${fecha}T00:00:00Z`);
  return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
}
export function semanaISO(fecha) {
  const d = new Date(`${fecha}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;            // lunes=0
  d.setUTCDate(d.getUTCDate() - day + 3);         // jueves de la semana ISO
  const jueves = d.getTime();
  d.setUTCMonth(0, 1);
  const semana = 1 + Math.round((jueves - d.getTime()) / 86400000 / 7);
  return `${new Date(jueves).getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}
export function seedSemanal(fecha) { const [y, w] = semanaISO(fecha).split('-W'); return Number(y) * 53 + Number(w); }

// Los 2 retos ACTIVOS de un usuario hoy: 1 diario + 1 semanal, DETERMINISTAS (sin azar) por índice.
export function retosActivosDe(hoy) {
  return [
    { reto: elegirDiario(diaDelAno(hoy)), periodo: hoy },                 // periodo diario = la fecha
    { reto: elegirSemanal(seedSemanal(hoy)), periodo: semanaISO(hoy) },   // periodo semanal = 'YYYY-Www'
  ].filter((x) => x.reto);
}

// Clave de dedupe del otorgamiento: 'CHALLENGE_COMPLETED:<id>@<periodo>'. El '@' mantiene id+periodo en el
// 2º campo (split_part por ':') → la clave canónica de la RPC es única POR PERIODO (un reto semanal se puede
// completar y premiar cada semana; sin '@' colisionaría entre periodos).
export function claveReto(reto, periodo) { return `CHALLENGE_COMPLETED:${reto.id}@${periodo}`; }

// Días (del set de fechas 'YYYY-MM-DD') dentro de la ventana [desde, hoy].
function enVentana(fecha, desde, hoy) { return fecha >= desde && fecha <= hoy; }

// ── Progreso determinista de un reto ──────────────────────────────────────────────────────────────
// eventos-based: nº de DÍAS distintos en la ventana con alguno de los EVENTOS del reto (del ledger).
// metrica-based: nº de días en rango / con proteína en meta (computado del motor). PUROS (reciben datos).
export function progresoEventos(reto, diasConEvento) {
  return Math.min(Number(reto.meta) || 0, new Set(diasConEvento || []).size);
}
export function progresoMetrica(reto, diasMetrica) {
  return Math.min(Number(reto.meta) || 0, Number(diasMetrica) || 0);
}
// Días (en la ventana) donde el usuario estuvo EN RANGO / cumplió PROTEÍNA — del motor, TCA-safe.
// porDia = { 'YYYY-MM-DD': { kcal, prot } }. targets/profile del usuario. NUNCA mira peso.
export function diasEnRango(porDia, { kcalTarget, bmr, sexo } = {}) {
  const piso = pisoSeguridad(bmr, sexo);
  let n = 0;
  for (const d of Object.values(porDia || {})) if (enRangoKcal({ consumido: d.kcal, target: kcalTarget, piso })) n += 1;
  return n;
}
export function diasProteina(porDia, { protTarget } = {}) {
  let n = 0;
  for (const d of Object.values(porDia || {})) if (proteinaEnMeta({ prot: d.prot, protTarget })) n += 1;
  return n;
}

// ── ORQUESTA (impuro, service_role). Recalcula y persiste challenge_progress de los 2 retos activos, y al
//    completar otorga (idempotente por la clave canónica). Best-effort: nunca lanza. Devuelve el estado para
//    que S4 (evalRetoCasi) lo use en la misma pasada. deps = { admin, otorgar } (otorgar = wrapper de la RPC). ──
export async function procesarRetos(admin, userId, { hoy, hist = [], targets = null, profile = null }) {
  const salida = [];
  try {
    const desdeSemana = (() => { const d = new Date(`${hoy}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 6); return d.toISOString().slice(0, 10); })();
    for (const { reto, periodo } of retosActivosDe(hoy)) {
      const desde = reto.periodo === PERIODOS.DIARIO ? hoy : desdeSemana;
      let progreso = 0;
      if (Array.isArray(reto.eventos) && reto.eventos.length) {
        // Días con algún evento del reto en la ventana (del ledger). clave_dedupe canónica = 'TIPO:<ref>' con ref=dia|id.
        const tipos = reto.eventos;
        const { data: evs } = await admin
          .from('gamification_events')
          .select('tipo, clave_dedupe, created_at')
          .eq('user_id', userId)
          .in('tipo', tipos)
          .gte('created_at', `${desde}T00:00:00Z`);
        const dias = new Set((evs || []).map((e) => (e.created_at || '').slice(0, 10)).filter((d) => enVentana(d, desde, hoy)));
        progreso = progresoEventos(reto, dias);
      } else if (reto.metrica) {
        // Métrica del motor: agrega meals por día en la ventana y cuenta días en rango / con proteína.
        const porDia = {};
        for (const m of hist || []) {
          if (!enVentana(m.date, desde, hoy)) continue;
          const k = m.date; (porDia[k] ||= { kcal: 0, prot: 0 });
          porDia[k].kcal += m.calories || 0; porDia[k].prot += m.protein_g || 0;
        }
        const n = reto.metrica === 'rango_dias'
          ? diasEnRango(porDia, { kcalTarget: targets?.kcal_target, bmr: targets?.bmr, sexo: profile?.sex })
          : diasProteina(porDia, { protTarget: targets?.protein_g });
        progreso = progresoMetrica(reto, n);
      }

      const completo = progreso >= (Number(reto.meta) || 0) && (Number(reto.meta) || 0) > 0;
      // Lee el estado previo (para no re-otorgar ni bajar estado). Deploy-safe.
      const { data: prev } = await admin.from('challenge_progress')
        .select('estado').eq('user_id', userId).eq('challenge_id', reto.id).eq('periodo', periodo).maybeSingle();
      const yaCompletado = prev?.estado === 'completado';
      const estado = (completo || yaCompletado) ? 'completado' : 'activo';
      await admin.from('challenge_progress').upsert({
        user_id: userId, challenge_id: reto.id, periodo,
        progreso: Math.min(progreso, reto.meta), meta: reto.meta, estado,
        completado_en: (estado === 'completado' && !yaCompletado) ? new Date().toISOString() : (prev?.completado_en ?? null),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,challenge_id,periodo' });

      // Otorga SOLO en la transición a completado (idempotente además por la clave canónica en el ledger).
      if (completo && !yaCompletado) {
        await admin.rpc('otorgar_evento', { p_tipo: 'CHALLENGE_COMPLETED', p_clave_dedupe: claveReto(reto, periodo), p_xp: xpDeReto(reto), p_user_id: userId });
      }
      salida.push({ id: reto.id, periodo, progreso: Math.min(progreso, reto.meta), meta: reto.meta, completo: estado === 'completado' });
    }
  } catch (e) { console.error('[retos] procesarRetos:', e?.message); }
  return salida;
}
