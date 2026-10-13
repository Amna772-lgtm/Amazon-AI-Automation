import type { NextConfig } from 'next';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // Browser talks to /api on the same origin; Next proxies to the NestJS API. This keeps the
  // refresh-token cookie first-party and avoids CORS in the browser.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
  poweredByHeader: false,
};

export default nextConfig;
