import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getHomeBriefing } from '@/lib/coach/briefing';
import { localDateTime } from '@/lib/coach/context';
import {
  evalMissedMeal, evalLowProtein, evalStreak, evalWeeklyReview, evalUserInactivity,
  enQuietHours, seleccionarPorPresupuesto, calcularRacha, diasDesdeUltimoRegistro, dedupeKey,
  TOGGLE_COL,
} from '@/lib/coach/triggers';
import { puliArNudge } from '@/lib/coach/redactar';
import { PREFS_DEFAULT } from '@/lib/coach/prefs';
import { enviarPush } from '@/lib/push/send';

const COACH_MODEL = 'claude-haiku-4-5'; // F1.5: Haiku solo PULE el tono (cifras del motor, no del modelo)

// Coach · Proactividad Fase 1 — CRON diario (Vercel Hobby).
// Recorre usuarios, evalúa triggers DETERMINISTAS (0 IA) y escribe notificaciones in-app SCOPED.
// Autenticación: bearer CRON_SECRET (Vercel lo inyecta como Authorization: Bearer si la env existe).
// service_role (bypassa RLS) SOLO tras verificar el secreto. Idempotente por (usuario,tipo,día).
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Hobby: tope de duración; el batching respeta un presupuesto de tiempo.

const PAGE = 200;           // usuarios por página
const TIME_BUDGET_MS = 45_000; // corta antes del tope de la función (sin truncar en silencio: se reporta)
const STREAK_WINDOW_DAYS = 35;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sin secreto configurado → nunca autoriza (fail-closed)
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

export async function GET(req) { return run(req); }
export async function POST(req) { return run(req); } // permite scheduler externo (QStash/cron-job.org)

async function run(req) {
  if (!authorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 });

  const t0 = Date.now();
  const { date: hoy, time } = localDateTime();
  const hora = parseInt(String(time).slice(0, 2), 10) || 0;
  // Día del reporte semanal = domingo (America/Mexico_City). getUTCDay sobre la fecha local es estable.
  const esDiaReporte = new Date(`${hoy}T00:00:00Z`).getUTCDay() === 0;

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error('[cron/tick] sin config admin:', e?.code || e?.message);
    return NextResponse.json({ error: 'sin configuración' }, { status: 500 });
  }

  // F1.5 · IA para PULIR tono (Pro-only, más gating por cap/kill-switch dentro de consumir_proactivo).
  // Kill instantáneo por env (PROACTIVO_IA_OFF=1) o sin API key → 0 IA (todo cae al texto determinista).
  const iaOff = process.env.PROACTIVO_IA_OFF === '1';
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const anthropic = (!iaOff && apiKey) ? new Anthropic({ apiKey }) : null;

  const stats = { scanned: 0, eligible: 0, inserted: 0, skippedQuiet: 0, skippedOff: 0, pages: 0, truncated: false, iaOk: 0, iaFallback: 0, pushSent: 0, pushDead: 0 };
  let cursor = null; // paginación por user_id (keyset)

  try {
    for (;;) {
      if (Date.now() - t0 > TIME_BUDGET_MS) { stats.truncated = true; break; }
      let q = admin.from('nutrition_profiles').select('user_id').order('user_id', { ascending: true }).limit(PAGE);
      if (cursor) q = q.gt('user_id', cursor);
      const { data: rows, error } = await q;
      if (error) {
        // Tabla base ausente = despliegue sin datos → no-op (no crash).
        console.error('[cron/tick] lectura de usuarios falló:', { code: error.code, details: error.details });
        break;
      }
      if (!rows || rows.length === 0) break;
      stats.pages += 1;

      for (const { user_id } of rows) {
        stats.scanned += 1;
        cursor = user_id;
        if (Date.now() - t0 > TIME_BUDGET_MS) { stats.truncated = true; break; }
        try {
          const n = await procesarUsuario(admin, user_id, { hoy, hora, esDiaReporte, stats, anthropic });
          stats.inserted += n;
        } catch (e) {
          console.error('[cron/tick] usuario falló (continúa):', user_id, e?.code || e?.message);
        }
      }
      if (stats.truncated) break;
      if (rows.length < PAGE) break; // última página
    }
  } catch (e) {
    console.error('[cron/tick] EXCEPCIÓN:', e?.message);
    return NextResponse.json({ error: 'fallo interno', stats }, { status: 500 });
  }

  console.log('[cron/tick] fin', { ...stats, ms: Date.now() - t0, hoy });
  return NextResponse.json({ ok: true, stats });
}

async function procesarUsuario(admin, userId, { hoy, hora, esDiaReporte, stats, anthropic }) {
  // Prefs (deploy-safe: sin fila o sin tabla → defaults).
  const prefsRes = await admin.from('coach_notification_prefs').select('*').eq('user_id', userId).maybeSingle();
  const prefs = { ...PREFS_DEFAULT, ...(prefsRes?.data || {}) };

  if (!prefs.proactive_on) { stats.skippedOff += 1; return 0; }
  if (enQuietHours(hora, prefs.quiet_start, prefs.quiet_end)) { stats.skippedQuiet += 1; return 0; }
  stats.eligible += 1;

  // Motor: cifras reales del día (mismos reads que la HOME). 0 IA.
  const brief = await getHomeBriefing(admin, userId);
  const objetivo = brief.macrosObjetivo;
  const consumido = brief.macrosConsumidos;

  // Plan (Pro = profiles.plan 'premium', misma fuente que consumir_ia).
  const planRes = await admin.from('profiles').select('plan').eq('id', userId).maybeSingle();
  const isPro = planRes?.data?.plan === 'premium';

  // Historial de fechas con registro (racha + agregado semanal + inactividad) en una sola query.
  const sinceStreak = restarDias(hoy, STREAK_WINDOW_DAYS);
  const histRes = await admin
    .from('meals')
    .select('date, calories')
    .eq('user_id', userId)
    .gte('date', sinceStreak);
  const hist = histRes?.data || [];
  const fechas = new Set(hist.map((m) => m.date));
  const { rachaHoy, rachaAyer, registroHoy } = calcularRacha(fechas, hoy);

  // Agregado semanal (últimos 7 días) para weekly_review.
  const since7 = restarDias(hoy, 6);
  const semana = hist.filter((m) => m.date >= since7);
  const diasSemana = new Set(semana.map((m) => m.date)).size;
  const kcalSemana = semana.reduce((a, m) => a + (m.calories || 0), 0);
  const kcalPromedio = diasSemana > 0 ? kcalSemana / diasSemana : 0;

  // F2 · inactividad: días desde el último registro (para el re-enganche por push).
  const diasInactivo = diasDesdeUltimoRegistro(fechas, hoy);

  // Evaluadores puros → candidatos. Se filtran por los toggles del usuario.
  let candidatos = [
    evalMissedMeal({ consumido, horaLocal: hora }),
    evalLowProtein({ objetivo, consumido, horaLocal: hora }),
    evalStreak({ rachaHoy, rachaAyer, registroHoy }),
    evalWeeklyReview({ esDiaReporte, isPro, diasConRegistro: diasSemana, kcalPromedio }),
    evalUserInactivity({ dias: diasInactivo }),
  ].filter(Boolean).filter((n) => prefs[TOGGLE_COL[n.event_type]] !== false);

  // Si dispara user_inactivity, subsume a missed_meal (misma familia "no registraste"): evita
  // mandar dos avisos redundantes al ausente.
  if (candidatos.some((n) => n.event_type === 'user_inactivity')) {
    candidatos = candidatos.filter((n) => n.event_type !== 'missed_meal');
  }

  if (!candidatos.length) return 0;

  // Anti-spam: cuántas notificaciones ya tiene HOY (para el presupuesto por modo).
  const { count: yaHoy } = await admin
    .from('coach_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('dia', hoy);

  const elegidos = seleccionarPorPresupuesto(candidatos, prefs.modo, yaHoy || 0);
  if (!elegidos.length) return 0;

  // Cuerpo final: determinista (verdad del motor) por defecto. Para Pro con IA activa, Haiku PULE el
  // tono; si algo se sale del carril → cae al determinista (nunca rompe ni publica fuera de carril).
  const filas = [];
  for (const n of elegidos) {
    const cuerpo = (anthropic && isPro)
      ? await puliArTono(admin, anthropic, userId, n, prefs.modo, stats)
      : n.cuerpo; // Free o IA apagada → texto determinista de F1 (0 IA)
    filas.push({
      user_id: userId,
      event_type: n.event_type,
      dia: hoy,
      slot: '',
      titulo: n.titulo,
      cuerpo,
      prioridad: n.prioridad,
    });
  }
  const { data: ins, error } = await admin
    .from('coach_notifications')
    .upsert(filas, { onConflict: 'user_id,event_type,dia,slot', ignoreDuplicates: true })
    .select('id, titulo, cuerpo, event_type');
  if (error) {
    // Tabla ausente (deploy-safe) u otro fallo → log con code/details, no crashea el cron.
    console.error('[cron/tick] insert notif falló:', { code: error.code, details: error.details, userId });
    return 0;
  }
  if (ins?.length) {
    console.log('[cron/tick] nudge', { userId, tipos: ins.map((n) => dedupeKey(n.event_type, hoy)) });
    // F2 · web push: entrega también al teléfono las notificaciones RECIÉN creadas (mismo texto ya
    // validado). No cambia el anti-spam: solo se empuja lo que ya se iba a crear. Deploy-safe.
    await empujarPush(admin, userId, ins, stats);
  }
  return ins?.length || 0;
}

// F2 · envía web push de las notificaciones recién creadas a las suscripciones del usuario y limpia
// las muertas (410/404). Deploy-safe: sin tabla/VAPID → no-op (solo queda la bandeja in-app).
async function empujarPush(admin, userId, nuevas, stats) {
  try {
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);
    if (error || !subs?.length) return; // sin tabla o sin suscripciones → solo in-app
    for (const n of nuevas) {
      const { enviados, muertos } = await enviarPush(
        subs,
        { title: n.titulo, body: n.cuerpo, url: '/coach', tag: n.event_type },
      );
      stats.pushSent += enviados;
      if (muertos.length) {
        stats.pushDead += muertos.length;
        await admin.from('push_subscriptions').delete().in('endpoint', muertos);
      }
    }
  } catch (e) {
    console.error('[cron/tick] push falló (no bloquea):', e?.message);
  }
}

// F1.5 · pule el tono de UN nudge con IA. Cablea el metering server-only (consumir/reembolsar_proactivo)
// a la orquestación testeable puliArNudge (reserva → Haiku → post-check → fallback determinista).
async function puliArTono(admin, anthropic, userId, n, modo, stats) {
  const rid = crypto.randomUUID();
  const { cuerpo, via } = await puliArNudge({
    anthropic, isPro: true, model: COACH_MODEL, nudge: n, modo,
    reservar: async () => {
      const { data, error } = await admin.rpc('consumir_proactivo', { p_request_id: rid, p_user_id: userId });
      if (error) {
        // RPC ausente (sin proactividad-ia.sql) u otro fallo → tratamos como no-permitido → determinista.
        console.error('[cron/tick] consumir_proactivo falló:', { code: error.code, details: error.details });
        return { allowed: false, reason: 'rpc_error' };
      }
      return data;
    },
    reembolsar: async () => {
      try { await admin.rpc('reembolsar_proactivo', { p_request_id: rid }); } catch { /* noop */ }
    },
  });
  if (via === 'ia') stats.iaOk += 1; else stats.iaFallback += 1;
  return cuerpo;
}

// 'YYYY-MM-DD' menos N días (UTC-safe).
function restarDias(fecha, n) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
