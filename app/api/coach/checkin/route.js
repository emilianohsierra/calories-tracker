import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkinActivo } from '@/lib/gamification/v2';
import { localDateTime } from '@/lib/coach/context';

// Gamificación V2.1 · S2 — POST /api/coach/checkin.
// Registra el check-in de ánimo/energía del día (1/día vía la RPC registrar_checkin, que hace
// upsert por (user_id, dia) y otorga el XP con clave idempotente CHECKIN_COMPLETED:<dia>).
// Consume lo que envía components/coach/CheckinAnimo.js → onSubmit({ animo, energia }).
//
// DEPLOY-SAFE: CHECKIN_ON/GAMIFICACION_V2_ON off, kill-switch on, o migración pendiente (RPC
// ausente) → { ok:false, disabled:true } (200, sin error): la UI degrada limpio, V1 intacto.
// TCA: el check-in es BIENESTAR (ánimo/energía cualitativos), nunca peso/calorías/juicio.
export const runtime = 'nodejs';

// Ánimos cualitativos permitidos (mismo enum que las CARITAS del componente).
const ANIMOS = new Set(['bajo', 'cansado', 'normal', 'bien', 'genial']);

// GET — ESTADO DE HOY para el widget (contrato de checkinClient de Rams):
//   null            → v2 off / migración pendiente / error → el widget se OCULTA (deploy-safe).
//   { hecho:false } → activo y aún sin check-in hoy → muestra el selector de caritas.
//   { hecho:true }  → ya hizo su check-in hoy → muestra el agradecimiento.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(null);

  // Gate deploy-safe: check-in inactivo (flag/kill) → null → widget oculto.
  if (!(await checkinActivo(supabase))) return NextResponse.json(null);

  const { date } = localDateTime(); // día local America/Mexico_City (igual que la RPC).
  try {
    const { data, error } = await supabase
      .from('checkins')
      .select('dia')
      .eq('user_id', user.id)
      .eq('dia', date)
      .maybeSingle();
    // Tabla ausente (migración pendiente) u otro error → null (oculta, no rompe).
    if (error) return NextResponse.json(null);
    return NextResponse.json({ hecho: !!data });
  } catch {
    return NextResponse.json(null);
  }
}

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

  // Gate deploy-safe: si el check-in no está activo (flag/kill), desactivado limpio.
  if (!(await checkinActivo(supabase))) {
    return NextResponse.json({ ok: false, disabled: true });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const energia = Number(body?.energia);
  const animo = String(body?.animo || '').trim();
  if (!ANIMOS.has(animo) || !Number.isInteger(energia) || energia < 1 || energia > 5) {
    return NextResponse.json({ error: 'Datos de check-in inválidos' }, { status: 400 });
  }
  // Nota libre OPCIONAL (corta). Se guarda tal cual; el coach la filtra por esDatoDeSalud al
  // LEERLA (S3), no aquí. Vacía → null.
  const notaRaw = body?.nota == null ? null : String(body.nota).trim().slice(0, 200);
  const nota = notaRaw || null;

  const { data, error } = await supabase.rpc('registrar_checkin', {
    p_animo: animo,
    p_energia: energia,
    p_nota: nota,
  });
  // RPC ausente (migración pendiente) o fallo interno → desactivado limpio (no rompe la UI).
  if (error || !data?.ok) {
    return NextResponse.json({ ok: false, disabled: true });
  }
  return NextResponse.json({ ok: true, dia: data.dia });
}
