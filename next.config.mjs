/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
