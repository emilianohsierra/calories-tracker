import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { leerEtiqueta } from '@/lib/pantry/label';
import { limitPayload } from '@/lib/paywall';
import { limitMessage, nextResetLabel } from '@/lib/usage';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024;
const OK_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

// rpc(...) es un thenable de PostgREST (sin .catch()). Envolver el reembolso.
async function safeRpc(supabase, fn, args) {
  try {
    await supabase.rpc(fn, args);
  } catch (e) {
    console.error('rpc fallo:', fn, e?.message);
  }
}

// POST /api/pantry/label — foto de etiqueta nutrimental → campos extraídos (estimado_ia) para
// la pantalla Confirmar. Es Claude vision (cuesta) → reserva atómica del cap de FOTOS (mismo
// que /api/analyze: consumir_analisis) ANTES de la IA; reembolsa si falla/vacío; 429 variant limit.
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

  // 1) Validar imagen ANTES de reservar (un 400 no debe cobrar).
  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }
  const file = form.get('image');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'No se recibió ninguna imagen' }, { status: 400 });
  }
  if (!OK_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Formato no soportado. Usa JPG, PNG o WebP.' }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: 'La imagen debe pesar entre 1 byte y 8 MB' }, { status: 400 });
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return NextResponse.json({ error: 'La lectura de etiqueta no está disponible por ahora.' }, { status: 503 });

  // 2) Reserva atómica del cap de fotos (T1, patrón consumir_analisis). ANTES de la IA.
  const requestId = crypto.randomUUID();
  const { data: consumed, error: rpcErr } = await supabase.rpc('consumir_analisis', { p_request_id: requestId });
  if (rpcErr || !consumed) {
    console.error('consumir_analisis (label):', rpcErr?.message);
    return NextResponse.json({ error: 'No se pudo verificar tu cuota. Intenta de nuevo.' }, { status: 500 });
  }
  if (!consumed.allowed) {
    const cap = Number(process.env.FREE_ANALYSIS_LIMIT) || 10;
    const remaining = consumed.remaining ?? 0;
    return NextResponse.json(
      {
        error: limitMessage(consumed.reason),
        reason: consumed.reason,
        ...limitPayload({ feature: 'analisis', usage: { plan: 'free', used: Math.max(0, cap - remaining), cap, remaining, resetLabel: nextResetLabel() } }),
      },
      { status: 429 }
    );
  }

  // Robustez (Slowking): si algo truena DESPUÉS de reservar y antes de responder → reembolsar.
  try {
  // 3) Leer la etiqueta con visión (Karpathy). Los valores son estimado_ia (NO verificado):
  //    el filtro de alérgenos ya trata estos ítems conservador. El modelo LEE, no inventa.
  let label = null;
  try {
    const anthropic = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
    label = await leerEtiqueta({ anthropic, model, base64: buffer.toString('base64'), mimeType: file.type });
  } catch (err) {
    console.error('leerEtiqueta EXCEPCION:', err?.status, err?.message);
  }

  if (!label) {
    // No es etiqueta / no se pudo leer → reembolsar (no cobrar) y avisar.
    await safeRpc(supabase, 'reembolsar_analisis', { p_request_id: requestId });
    return NextResponse.json({ error: 'No pude leer la etiqueta. Intenta con una foto más clara y de frente.' }, { status: 422 });
  }

  // 4) Devolver en el shape del cliente (Rams): { product:{ nombre, marca, categoria, unidad,
  //    nutricion:{...}, confianza:'ai' } }. Una etiqueta nutrimental da la NUTRICIÓN; nombre/
  //    marca/categoría los completa la persona en Confirmar (el OCR no los trae fiables).
  const product = {
    nombre: '',
    marca: '',
    categoria: '',
    unidad: 'g',
    nutricion: {
      base: label.base,
      porcion_g: label.porcion_g,
      kcal: label.kcal,
      prot: label.prot,
      carb: label.carb,
      gras: label.gras,
      fibra: label.fibra,
      azucar: label.azucar,
      sodio_mg: label.sodio_mg,
      procedencia: 'estimado_ia', // NO verificado → safety.js lo trata conservador
    },
    confianza: 'ai',
    confirmado: false,
  };
  return NextResponse.json({ product, restantes: consumed.remaining ?? null });
  } catch (err) {
    console.error('label EXCEPCION post-reserva:', err?.status, err?.message);
    await safeRpc(supabase, 'reembolsar_analisis', { p_request_id: requestId });
    return NextResponse.json({ error: 'No pude leer la etiqueta. Intenta de nuevo.' }, { status: 200 });
  }
}
