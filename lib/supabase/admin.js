import { createClient } from '@supabase/supabase-js';

// ⚠️ CLIENTE ADMIN — service_role, BYPASSA RLS.
// ÚNICA excepción permitida al "sin service_role en runtime" (ver plan/E-monetizacion-stripe.md §4).
// SOLO debe importarse desde app/api/stripe/webhook/route.js, que verifica la firma de
// Stripe ANTES de cualquier escritura. Nunca usar en otro archivo, nunca en el navegador,
// nunca con la anon key. SUPABASE_SERVICE_ROLE_KEY es variable de servidor (jamás NEXT_PUBLIC_).
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
