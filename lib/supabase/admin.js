import { createClient } from '@supabase/supabase-js';

// ⚠️ CLIENTE ADMIN — service_role, BYPASSA RLS.
// Excepción acotada al "sin service_role en runtime" (ver plan/E-monetizacion-stripe.md §4).
// Importadores CONOCIDOS:
//   · app/api/stripe/webhook/route.js — verifica la firma de Stripe antes de cualquier escritura.
//   · app/api/coach/cron/tick/route.js — verifica el bearer CRON_SECRET antes de leer/escribir;
//     el cron recorre usuarios (no hay sesión) y escribe notificaciones SCOPED por user_id.
//   · app/api/pantry/search/route.js — lectura del catálogo público (Fase D); ruta autenticada,
//     solo lee (bajo riesgo). Pre-existente; en backlog para migrar a lectura sin service_role.
// Nunca usar en otro archivo, nunca en el navegador, nunca con la anon key.
// SUPABASE_SERVICE_ROLE_KEY es variable de servidor (jamás NEXT_PUBLIC_).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    const err = new Error('Falta configuración de Supabase admin (URL o SERVICE_ROLE_KEY)');
    err.code = 'NO_ADMIN_CONFIG';
    throw err;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
