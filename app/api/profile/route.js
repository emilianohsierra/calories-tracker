import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { COACH_IDS } from '@/lib/nutrition/coaches';
import { computeTargets } from '@/lib/nutrition/compute';

// Onboarding por objetivos (Rebanada 1). Guarda el perfil y calcula el plan
// (motor DETERMINISTA, sin IA). No toca analyze/meals/Stripe.

const SEX = ['male', 'female'];
// PAL continuo 1.2–1.9 (coincide con el CHECK de la BD y admite valores intermedios
// como el 1.6 del ejemplo runner). El onboarding presenta niveles discretos, pero el
// backend acepta el rango para no rechazar valores válidos.
const PAL_MIN = 1.2;
const PAL_MAX = 1.9;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const [{ data: profile }, { data: targets }] = await Promise.all([
    supabase.from('nutrition_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('nutrition_targets').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  return NextResponse.json({ profile: profile || null, targets: targets || null });
}

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  // --- Validación server-side (defensa; la BD además tiene CHECKs) ---
  const errors = [];
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

  const sex = String(body.sex || '');
  if (!SEX.includes(sex)) errors.push('sexo');

  const age = Math.round(num(body.age));
  if (!Number.isFinite(age) || age < 14 || age > 100) errors.push('edad');

  const heightCm = num(body.height_cm);
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) errors.push('altura');

  const weightKg = num(body.weight_kg);
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) errors.push('peso');

  const pal = num(body.activity_pal);
  if (!Number.isFinite(pal) || pal < PAL_MIN || pal > PAL_MAX) errors.push('nivel de actividad');

  const coach = String(body.coach || '');
  if (!COACH_IDS.includes(coach)) errors.push('coach');

  // Opcionales
  let targetWeight = null;
  if (body.target_weight_kg !== undefined && body.target_weight_kg !== null && body.target_weight_kg !== '') {
    targetWeight = num(body.target_weight_kg);
    if (!Number.isFinite(targetWeight) || targetWeight < 30 || targetWeight > 300) errors.push('peso objetivo');
  }
  let bodyFat = null;
  if (body.body_fat_pct !== undefined && body.body_fat_pct !== null && body.body_fat_pct !== '') {
    bodyFat = num(body.body_fat_pct);
    if (!Number.isFinite(bodyFat) || bodyFat < 3 || bodyFat > 60) errors.push('% de grasa');
  }
  const trainingDays = Number.isFinite(num(body.training_days))
    ? Math.min(Math.max(Math.round(num(body.training_days)), 0), 14)
    : 0;

  if (errors.length) {
    return NextResponse.json({ error: `Datos inválidos: ${errors.join(', ')}` }, { status: 400 });
  }

  const arr = (v) => (Array.isArray(v) ? v.slice(0, 30).map(String) : []);
  const profileRow = {
    user_id: user.id,
    sex,
    age,
    height_cm: heightCm,
    weight_kg: weightKg,
    target_weight_kg: targetWeight,
    body_fat_pct: bodyFat,
    activity_pal: pal,
    training_days: trainingDays,
    coach,
    coach_params: body.coach_params && typeof body.coach_params === 'object' ? body.coach_params : {},
    objectives: body.objectives && typeof body.objectives === 'object' ? body.objectives : {},
    dietary_pattern: String(body.dietary_pattern || 'ninguno').slice(0, 40),
    intolerances: arr(body.intolerances),
    allergies: arr(body.allergies),
    conditions: [], // Ola 1: coaches no-médicos (los clínicos entran al final, con validación)
    country: String(body.country || 'MX').slice(0, 4),
    budget: body.budget ? String(body.budget).slice(0, 20) : null,
    cook_time: body.cook_time ? String(body.cook_time).slice(0, 20) : null,
    tone: String(body.tone || 'cercano').slice(0, 20),
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  };

  // Plan ANTERIOR (para el diff previo→nuevo en la edición). No toca racha ni historial.
  const { data: prevTargets } = await supabase
    .from('nutrition_targets')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  // --- Guardar perfil ---
  const { error: pErr } = await supabase
    .from('nutrition_profiles')
    .upsert(profileRow, { onConflict: 'user_id' });
  if (pErr) {
    console.error('Error al guardar perfil:', pErr);
    return NextResponse.json(
      { error: 'No se pudo guardar tu perfil', detail: pErr.message, code: pErr.code },
      { status: 500 }
    );
  }

  // --- Calcular plan (DETERMINISTA) y persistir targets ---
  let targets;
  try {
    targets = computeTargets(profileRow);
  } catch (err) {
    console.error('Error al calcular targets:', err);
    return NextResponse.json({ error: 'No se pudo calcular tu plan', detail: err.message }, { status: 500 });
  }

  // `warn` es un aviso suave para la UI, NO una columna de nutrition_targets: se excluye
  // del insert para no disparar un error de esquema (PGRST204).
  const { warn, ...targetCols } = targets;
  const { error: tErr } = await supabase
    .from('nutrition_targets')
    .upsert({ user_id: user.id, ...targetCols, computed_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (tErr) {
    console.error('Error al guardar targets:', tErr);
    return NextResponse.json(
      { error: 'No se pudo guardar tu plan', detail: tErr.message, code: tErr.code },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: profileRow, targets, targets_prev: prevTargets || null }, { status: 201 });
}
