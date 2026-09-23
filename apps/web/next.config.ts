import type { NextConfig } from 'next';

// A Content-Security-Policy is deliberately not set yet: Next.js needs a
// per-request nonce (via proxy/middleware) for a strict CSP. Tracked in
// docs/TECH_DEBT.md.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Microphone stays available to our own origin for in-browser voice agent testing.
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default nextConfig;
