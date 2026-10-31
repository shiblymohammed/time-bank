import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Next.js configuration for Kottakkal Time Bank web dashboard.
 *
 * D#96: Next.js + React + TypeScript web frontend
 * D#93: Browser dashboards for coordinators, admins, Super Admin and merchants
 */
const nextConfig: NextConfig = {
  // API traffic goes through the allowlisted /api/backend gateway, not a blanket rewrite.

  // Self-contained server for infra/docker/Dockerfile.web; trace from the monorepo root so
  // pnpm workspace dependencies are included.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),

  // Strict mode helps surface concurrent rendering issues early
  reactStrictMode: true,

  // NFR-17: Expose version in headers for deployment verification
  poweredByHeader: false,

  // Headers for security (NFR-08: transport encryption and security headers)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },

  // TypeScript strict checking in builds (complements tsconfig strict)
  typescript: {
    ignoreBuildErrors: false,
  },

  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
