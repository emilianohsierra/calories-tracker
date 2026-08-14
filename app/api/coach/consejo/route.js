import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { localDateTime } from '@/lib/coach/context';
import { calcularRacha } from '@/lib/coach/triggers';
import { esDatoDeSalud } from '@/lib/coach/actions';
import { readItemsParaMatching } from '@/lib/pantry/db';
import { filtrarDespensaSegura } from '@/lib/pantry/safety';
import { elegirFoco, construirConsejo, OBJETIVO_LABEL } from '@/lib/coach/consejo';
import { personalizarConsejo } from '@/lib/coach/consejoIA';
import { juezEducacionIA } from '@/lib/coach/juezEducacionIA';

// Coach · Consejo del Día (WOW). GET → { consejo: {foco,titulo,cuerpo,dato_motor?,cta?} } (schema Rams).
// ON-FIRST-OPEN: genera+cachea 1/usuario/día (idempotente por PK user_id,dia). Free = plantilla
// determinista ($0 IA); Pro = Haiku redacta el cuerpo (doble cinturón + fallback). DEPLOY-SAFE:
// sin tabla/API/flag/kill/rpc → plantilla determinista; NUNCA rompe la HOME.
export const runtime = 'nodejs';
const COACH_MODEL = 'claude-haiku-4-5';

const r = (n) => Math.round(Number.isFinite(Number(n)) ? Number(n) : 0);
const restarDias = (fecha, n) => { const d = new Date(`${fecha}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const diaDelAno = (fecha) => { const d = new Date(`${fecha}T00:00:00Z`); return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000); };

// Fila de coach_consejo_dia → schema del cliente.
function aConsejo(row) {
  const c = { foco: row.foco, titulo: row.titulo, cuerpo: row.cuerpo };
  if (row.dato_valor) c.dato_motor = { label: row.dato_label || '', valor: row.dato_valor };
  if (row.cta_accion) c.cta = { label: row.cta_label || '', accion: row.cta_accion };
  return c;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    const { date: hoy } = localDateTime();

    // 1) CACHE (idempotente 1/día). Si existe, se devuelve el mismo (no se regenera al reabrir).
    const cache = await supabase.from('coach_consejo_dia').select('*').eq('user_id', user.id).eq('dia', hoy).maybeSingle();
    if (cache?.data) return NextResponse.json({ consejo: aConsejo(cache.data) });

    // 2) CONTEXTO del día (cifras del motor). Deploy-safe: tablas ausentes → valores neutros.
    const ayer = restarDias(hoy, 1);
    const since35 = restarDias(hoy, 35);
    const [{ data: perfil }, { data: targets }, { data: mealsHoy }, { data: mealsAyer }, { data: hist }, { data: dayState }] = await Promise.all([
      supabase.from('nutrition_profiles').select('coach, allergies, intolerances, coach_params, onboarding_completed').eq('user_id', user.id).maybeSingle(),
      supabase.from('nutrition_targets').select('protein_g, kcal_target, water_ml').eq('user_id', user.id).maybeSingle(),
      supabase.from('meals').select('protein_g').eq('user_id', user.id).eq('date', hoy),
      supabase.from('meals').select('protein_g').eq('user_id', user.id).eq('date', ayer),
      supabase.from('meals').select('date').eq('user_id', user.id).gte('date', since35),
      supabase.from('coach_day_state').select('agua_ml').eq('user_id', user.id).eq('date', hoy).maybeSingle(),
    ]);

    const restricciones = [...(perfil?.allergies || []), ...(perfil?.intolerances || [])];
    const protMeta = targets?.protein_g ? r(targets.protein_g) : null;
    const protHoy = (mealsHoy || []).reduce((a, m) => a + (m.protein_g || 0), 0);
    const protAyer = (mealsAyer || []).length ? (mealsAyer).reduce((a, m) => a + (m.protein_g || 0), 0) : null;
    const fechas = new Set((hist || []).map((m) => m.date));
    const { rachaHoy, rachaAyer, registroHoy } = calcularRacha(fechas, hoy);
    const racha = registroHoy ? rachaHoy : rachaAyer;
    const semana = new Set((hist || []).filter((m) => m.date >= restarDias(hoy, 6)).map((m) => m.date)).size;
    const cp = (perfil && typeof perfil.coach_params === 'object' && perfil.coach_params) || {};

    // Despensa SEGURA (filtro de alérgenos vivo) → top 2 nombres.
    let despensa = [];
    try {
      const items = await readItemsParaMatching(supabase, user.id, 40);
      // Slowking MENOR 1: en una sugerencia PROACTIVA no nombramos lo incierto → 'excluir' (un item
      // no-verificado NO entra), aunque sea un grupo ADVERTIBLE (lactosa). Así ctx.ingrediente nunca
      // toma un item dudoso para el titulo/dato.
      const { seguros } = filtrarDespensaSegura(items || [], restricciones, { politicaNoVerificado: 'excluir' });
      despensa = (seguros || []).map((x) => x.nombre).filter(Boolean).slice(0, 4);
    } catch { despensa = []; }

    const ctx = {
      objetivo_label: OBJETIVO_LABEL[perfil?.coach] || 'tus metas',
      prot_meta: protMeta,
      prot_pendiente: protMeta ? Math.max(0, protMeta - r(protHoy)) : null,
      prot_ayer: protAyer != null ? r(protAyer) : null,
      entreno_hoy: cp.entreno_hoy?.title || (typeof cp.entreno_hoy === 'string' ? cp.entreno_hoy : null),
      km_hoy: cp.km_hoy || null,
      despensa,
      ingrediente: despensa[0] || null,
      ingrediente2: despensa[1] || null,
      racha_dias: racha || null,
      hito_racha: [3, 7, 14, 30].includes(racha),
      adherencia: (hist && hist.length) ? Math.round((semana / 7) * 100) : null,
      agua_ml: dayState?.agua_ml ?? null,
      agua_meta: targets?.water_ml ? r(targets.water_ml) : null,
      registroHoy,
      esNuevo: !(hist && hist.length),
      restricciones,
    };

    // 3) FOCO determinista (excluye focos de los últimos 14 días) + plantilla base.
    const { data: recientesRows } = await supabase.from('coach_consejo_dia').select('foco').eq('user_id', user.id).gte('dia', restarDias(hoy, 14));
    const recientes = (recientesRows || []).map((x) => x.foco);
    const diaIdx = diaDelAno(hoy);
    const foco = elegirFoco(ctx, recientes, diaIdx);
    const base = construirConsejo(foco, ctx, diaIdx);

    // 4) Path IA (Pro por defecto = Decisión A; Free si CONSEJO_IA_FREE=1 = Decisión B). Kill-switch y
    //    caps se aplican dentro de consumir_consejo (server). Sin API key / off → plantilla.
    const { data: prof } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle();
    const isPro = prof?.plan === 'premium';
    const iaFree = process.env.CONSEJO_IA_FREE === '1';
    const iaOff = process.env.CONSEJO_IA_OFF === '1';
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    const anthropic = (!iaOff && (isPro || iaFree) && apiKey) ? new Anthropic({ apiKey }) : null;

    let consejo = base;
    let generadoPor = 'plantilla';
    if (anthropic) {
      const rid = crypto.randomUUID();
      const res = await personalizarConsejo(
        {
          anthropic,
          esSalud: esDatoDeSalud,
          reservar: async () => {
            const { data, error } = await supabase.rpc('consumir_consejo', { p_request_id: rid });
            if (error) { console.error('consumir_consejo falló:', { code: error.code }); return { allowed: false, reason: `rpc_error:${error.code || 'x'}` }; }
            return data;
          },
          reembolsar: async () => { try { await supabase.rpc('reembolsar_ia', { p_request_id: rid }); } catch { /* noop */ } },
          redactar: (b) => redactarConsejo({ anthropic, base: b, tono: cp.tono }),
          juez: (texto) => juezEducacionIA({ anthropic, model: COACH_MODEL, texto }),
        },
        { base, restricciones },
      );
      consejo = res.consejo;
      generadoPor = res.generado_por;
    }

    // 5) Persistir (idempotente ON CONFLICT DO NOTHING). Si la tabla no existe → no rompe, igual responde.
    try {
      await supabase.from('coach_consejo_dia').upsert(
        {
          user_id: user.id, dia: hoy, foco: consejo.foco, titulo: consejo.titulo, cuerpo: consejo.cuerpo,
          dato_label: consejo.dato_motor?.label || null, dato_valor: consejo.dato_motor?.valor || null,
          cta_label: consejo.cta?.label || null, cta_accion: consejo.cta?.accion || null, generado_por: generadoPor,
        },
        { onConflict: 'user_id,dia', ignoreDuplicates: true },
      );
    } catch (e) { console.error('consejo persist falló (no bloquea):', e?.message); }

    return NextResponse.json({ consejo });
  } catch (err) {
    console.error('consejo GET EXCEPCIÓN:', err?.message);
    // Nunca romper la HOME: si algo falla, el cliente cae a su fallback genérico.
    return NextResponse.json({ error: 'No se pudo generar el consejo' }, { status: 500 });
  }
}

// Haiku reescribe el CUERPO del consejo en el tono del usuario. Cifras del motor INTACTAS; marco
// neutro-saludable; sin peso/culpa/médico/mitos; máximo 2 frases. El post-check/juez lo validan luego.
async function redactarConsejo({ anthropic, base, tono }) {
  const system =
    'Eres el coach nutricional. Reescribe el CUERPO de este consejo del día para que suene natural y cercano' +
    (tono ? ` en tono ${tono}` : '') + '. REGLAS ABSOLUTAS:\n' +
    '1) NO cambies ningún número: las cifras son del motor, cópialas idénticas; no inventes cifras nuevas.\n' +
    '2) Marco AÑADIR, no restringir: suma hábitos (proteína, fibra, agua, un ingrediente); PROHIBIDO "come menos"/"sáltate"/"quema"/"compensa".\n' +
    '3) CERO peso/báscula/culpa ("bajaste/subiste", "te pasaste", "vas mal"); cero consejo médico; no demonices alimentos; nada de mitos (quemar grasa, acelerar metabolismo).\n' +
    '4) Máximo 2 frases, español (México), sin emojis, sin comillas. Devuelve SOLO el cuerpo reescrito.';
  const rsp = await anthropic.messages.create({
    model: COACH_MODEL,
    max_tokens: 160,
    system,
    messages: [{ role: 'user', content: `Título: ${base.titulo}\nCuerpo: ${base.cuerpo}` }],
  });
  const parts = Array.isArray(rsp?.content) ? rsp.content : [];
  return parts.map((p) => (p?.type === 'text' ? p.text : '')).join('').trim();
}
