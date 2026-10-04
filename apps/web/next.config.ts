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
  // Ship a self-contained server bundle for the production Docker image.
  // The `standalone` build in .next/standalone/ carries only the dependencies
  // this server actually needs, so the runtime image drops from ~1 GB to ~200 MB.
  output: 'standalone',
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
  // The homepage is the static page authored in the nivomiai/website repo (plus a Login button),
  // served ahead of the app routes. Its "Login" leads into the customer app flow.
  rewrites() {
    return Promise.resolve({
      beforeFiles: [{ source: '/', destination: '/site/home.html' }],
      afterFiles: [],
      fallback: [],
    });
  },
};

export default nextConfig;
