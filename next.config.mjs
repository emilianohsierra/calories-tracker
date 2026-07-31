/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: import.meta.dirname,
  // No cachear el HTML del app-shell → un refresh normal SIEMPRE revalida y trae el
  // bundle más nuevo (los chunks de /_next/static siguen inmutables/versionados por hash).
  async headers() {
    const noStore = [{ key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' }];
    return [
      { source: '/', headers: noStore },
      { source: '/coach', headers: noStore },
      { source: '/onboarding', headers: noStore },
      { source: '/perfil', headers: noStore },
      { source: '/login', headers: noStore },
    ];
  },
};

export default nextConfig;
