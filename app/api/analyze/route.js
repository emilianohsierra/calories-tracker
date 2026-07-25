import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { analyzeFoodImage } from '@/lib/analyze';
import { createClient } from '@/lib/supabase/server';
import { limitMessage } from '@/lib/usage';

const MAX_BYTES = 8 * 1024 * 1024;
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const BUCKET = 'meal-photos';

export async function POST(request) {
  // 1) Auth: getUser() valida el JWT (H8). Sin usuario verificado → 401.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Inicia sesión para analizar con IA.' }, { status: 401 });
  }

  // 2) Parseo + validación de la imagen ANTES de reservar crédito (un 400 no debe cobrar).
  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  const file = form.get('image');
  const hint = (form.get('hint') || '').toString().slice(0, 300);
  const feedback = (form.get('feedback') || '').toString().slice(0, 400);
  let previous = null;
  try {
    const parsed = JSON.parse(form.get('previous') || 'null');
    if (parsed && typeof parsed === 'object') previous = parsed;
  } catch {
    // previous inválido: se ignora y se analiza desde cero
  }
  // reuse: nombre bare del objeto ya subido (se sanea; sin '/' ni traversal).
  const reuse = (form.get('reuse') || '').toString().replace(/[^a-zA-Z0-9.-]/g, '');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'No se recibió ninguna imagen' }, { status: 400 });
  }
  const ext = EXT_BY_MIME[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: 'Formato no soportado. Usa una imagen JPG, PNG o WebP.' },
      { status: 400 }
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: 'La imagen debe pesar entre 1 byte y 8 MB' }, { status: 400 });
  }

  // 3) Reserva atómica de 1 crédito de IA. Cubre TODA llamada a Claude, incluida la
  //    ruta de corrección (feedback/previous), porque es incondicional aquí (H2).
  const requestId = crypto.randomUUID();
  const { data: consumed, error: rpcErr } = await supabase.rpc('consumir_analisis', {
    p_request_id: requestId,
  });
  if (rpcErr || !consumed) {
    console.error('Error en consumir_analisis:', rpcErr);
    return NextResponse.json(
      { error: 'No se pudo verificar tu cuota. Intenta de nuevo.' },
      { status: 500 }
    );
  }
  if (!consumed.allowed) {
    return NextResponse.json(
      { error: limitMessage(consumed.reason), reason: consumed.reason, remaining: consumed.remaining ?? 0 },
      { status: 429 }
    );
  }

  // 4) Llamar a Claude.
  let analysis, provider, billed;
  try {
    const correction = feedback && previous ? { feedback, previous } : null;
    ({ analysis, provider, billed } = await analyzeFoodImage(
      buffer.toString('base64'),
      file.type,
      hint,
      correction
    ));
  } catch (err) {
    console.error('Error al analizar imagen:', err);
    // Reembolsar salvo cobro real confirmado (H1): solo se NIEGA el reembolso cuando
    // billed===true (éxito o 200-malformado). Cualquier otro caso —incluidos los throws
    // pre-try como NO_API_KEY/BAD_PROVIDER donde billed queda undefined— reembolsa.
    if (err.billed !== true) {
      await supabase.rpc('reembolsar_analisis', { p_request_id: requestId }).catch(() => {});
    }
    const label = err.provider?.label || 'el proveedor de IA';
    const keyEnv = err.provider?.keyEnv || 'la API key';
    const billing = err.provider?.billingHint || 'la consola del proveedor';
    let message = `No se pudo analizar la imagen con ${label}. Intenta de nuevo.`;
    if (err.code === 'NO_API_KEY' || err.code === 'BAD_PROVIDER') {
      message = err.message;
    } else if (err.status === 401) {
      message = `La API key de ${label} es inválida o fue revocada. Revisa ${keyEnv} en .env.local`;
    } else if (err.code === 'insufficient_quota' || (err.status === 429 && /quota|credit/i.test(err.message || ''))) {
      message = `Tu cuenta de ${label} no tiene crédito disponible. Agrega saldo en ${billing}.`;
    } else if (err.status === 429) {
      message = `Límite de solicitudes de ${label} alcanzado. Espera un momento e intenta de nuevo.`;
    } else if (err.status === 404 && err.provider) {
      const model = process.env[err.provider.modelEnv] || err.provider.defaultModel;
      message = `El modelo "${model}" no existe en ${label}. Revisa ${err.provider.modelEnv} en .env.local`;
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // 5) es_comida=false → Anthropic SÍ facturó (billed=true) → NO se reembolsa (H1).
  if (!analysis.es_comida) {
    return NextResponse.json(
      { error: 'La imagen no parece contener comida. Intenta con otra foto.', remaining: consumed.remaining },
      { status: 422 }
    );
  }

  // 6) Guardar/reutilizar la foto en Supabase Storage (bucket privado, carpeta del
  //    usuario). El user_id sale de la sesión, no del cliente → la RLS de storage
  //    solo permite escribir en {user.id}/...
  let filename = '';
  if (reuse) {
    // Reanálisis: si el objeto ya existe en la carpeta del usuario, no re-subir.
    const { data: existing } = await supabase.storage.from(BUCKET).list(user.id, { search: reuse });
    if (existing?.some((o) => o.name === reuse)) filename = reuse;
  }
  if (!filename) {
    const candidate = `${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(`${user.id}/${candidate}`, buffer, { contentType: file.type });
    if (upErr) {
      // No romper el análisis por un fallo al guardar la foto: se guarda sin imagen.
      console.error('Error al subir foto a Storage:', upErr);
    } else {
      filename = candidate;
    }
  }

  return NextResponse.json({
    ...analysis,
    imagen: filename,
    proveedor: provider.label,
    restantes: consumed.remaining,
  });
}
