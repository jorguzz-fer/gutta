import type { NextConfig } from 'next';
import path from 'node:path';

// Cabeçalhos de segurança fixos. A CSP é montada por requisição em src/proxy.ts.
const nextConfig: NextConfig = {
  // standalone só na imagem Docker (NEXT_OUTPUT_STANDALONE=1); localmente `next start` funciona normal.
  output: process.env.NEXT_OUTPUT_STANDALONE === '1' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  transpilePackages: [
    '@gutta/ai',
    '@gutta/core',
    '@gutta/db',
    '@gutta/contracts',
    '@gutta/jobs',
    '@gutta/storage',
  ],
  serverExternalPackages: ['@node-rs/argon2', 'pg', 'ioredis'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
