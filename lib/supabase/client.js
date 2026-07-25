import { createBrowserClient } from '@supabase/ssr';

// Cliente de Supabase para el NAVEGADOR (componentes 'use client').
// Usa la anon key (segura de exponer: la protección real es RLS).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
