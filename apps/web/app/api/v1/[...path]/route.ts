import { forwardToApi } from '@/lib/server/api-forward';

/**
 * Local/e2e stand-in for the production load-balancer rule that routes `/api/v1/*` to the API
 * service. Keeps the browser same-origin so auth cookies stay first-party and host-only.
 */
export const dynamic = 'force-dynamic';

export const GET = forwardToApi;
export const POST = forwardToApi;
export const PUT = forwardToApi;
export const PATCH = forwardToApi;
export const DELETE = forwardToApi;
