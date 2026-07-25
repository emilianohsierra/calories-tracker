import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Middleware: refresca la sesión de Supabase y protege la app.
// REGLA DE ORO: NUNCA debe lanzar. Corre en Edge Runtime en Vercel; si createServerClient
// o getUser fallan (env var malformada, fallo de red, etc.), un throw aquí 500-earía TODO
// el sitio. Por eso todo va en try/catch y siempre se FALLA SEGURO:
//   - páginas  -> redirige a /login (nunca dejar pasar sin auth)
//   - /api/*   -> deja pasar (cada handler responde su propio 401 con getUser())
export async function middleware(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const path = request.nextUrl.pathname;
  const isLogin = path.startsWith('/login');
  const isApi = path.startsWith('/api');

  const toLogin = () => {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    return NextResponse.redirect(redirectUrl);
  };

  // Sin config aún (claves no pegadas): no romper la app.
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    // getUser() valida el JWT (no confía en la cookie tal cual) — H8.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !isLogin && !isApi) return toLogin();
    if (user && isLogin) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/';
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  } catch (err) {
    // Falla segura: el middleware NUNCA 500-ea el sitio.
    console.error('middleware: no se pudo verificar la sesión:', err);
    if (isApi || isLogin) return NextResponse.next(); // /api → su propio 401; /login → cargar
    return toLogin(); // páginas protegidas → login (nunca pasar sin auth)
  }
}

export const config = {
  // Excluye estáticos e imágenes; incluye páginas y /api (para refrescar sesión).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
