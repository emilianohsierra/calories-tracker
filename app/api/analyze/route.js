import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getUploadsDir } from '@/lib/db';
import { analyzeFoodImage } from '@/lib/analyze';

const MAX_BYTES = 8 * 1024 * 1024;
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function POST(request) {
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
  const reuse = path.basename((form.get('reuse') || '').toString());
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

  let analysis, provider;
  try {
    const correction = feedback && previous ? { feedback, previous } : null;
    ({ analysis, provider } = await analyzeFoodImage(buffer.toString('base64'), file.type, hint, correction));
  } catch (err) {
    console.error('Error al analizar imagen:', err);
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

  if (!analysis.es_comida) {
    return NextResponse.json(
      { error: 'La imagen no parece contener comida. Intenta con otra foto.' },
      { status: 422 }
    );
  }

  // En un reanálisis se reutiliza la foto ya guardada en lugar de duplicarla.
  let filename = '';
  if (reuse && reuse !== '.') {
    filename = await fs
      .access(path.join(getUploadsDir(), reuse))
      .then(() => reuse)
      .catch(() => '');
  }
  if (!filename) {
    filename = `${crypto.randomUUID()}.${ext}`;
    await fs.writeFile(path.join(getUploadsDir(), filename), buffer);
  }

  return NextResponse.json({ ...analysis, imagen: filename, proveedor: provider.label });
}
