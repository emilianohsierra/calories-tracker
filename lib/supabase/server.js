import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Cliente de Supabase para el SERVIDOR (route handlers y server components).
// Lee/escribe la sesión desde las cookies. En Next 15, cookies() es async.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Llamado desde un Server Component sin respuesta que mutar: el refresco
            // de sesión lo hace el middleware, así que se puede ignorar.
          }
        },
      },
    }
  );
}
