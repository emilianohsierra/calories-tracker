/** @type {import('next').NextConfig} */

// SHA del commit (Vercel lo expone en build). Se inyecta al cliente para bust-ear la URL del SW
// en cada deploy → fuerza la detección de versión nueva aunque el binario del SW no cambie.
const COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA || 'dev';

const nextConfig = {
  outputFileTracingRoot: import.meta.dirname,
  env: { NEXT_PUBLIC_COMMIT_SHA: COMMIT_SHA },
  // Anti-stale tras deploy: el DOCUMENTO HTML, el SW y el manifest SIEMPRE revalidan → un refresh
  // (o auto-reload del SW) trae el HTML nuevo, que referencia los chunks nuevos. Los /_next/static
  // siguen INMUTABLES (versionados por hash) — NO se tocan aquí, así el cacheo agresivo de chunks
  // se mantiene (perf) mientras el entry HTML nunca queda viejo.
  async headers() {
    const htmlNoStore = [{ key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' }];
    return [
      // El binario del SW NUNCA se cachea → un SW nuevo se detecta de inmediato.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
      { source: '/manifest.json', headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }] },
      // Documento HTML de CUALQUIER ruta de página. Excluye /_next/* (chunks inmutables), /api/* y
      // cualquier archivo con extensión (sw.js, manifest.json, icon.svg, favicon…): esos NO llevan
      // no-store. Así /lista, /despensa y toda ruta futura quedan cubiertas sin enumerarlas.
      { source: '/:path((?!_next/|api/|.*\\.).*)', headers: htmlNoStore },
    ];
  },
};

export default nextConfig;
