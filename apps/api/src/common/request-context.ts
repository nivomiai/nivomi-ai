import type { Request } from 'express';

/** Client metadata recorded with sessions and audit events. */
export interface ClientContext {
  readonly requestId: string;
  readonly ipAddress: string;
  readonly userAgent: string | null;
}

export function clientContext(request: Request): ClientContext {
  const agent = request.headers['user-agent'];
  return {
    requestId: typeof request.id === 'string' ? request.id : 'unknown',
    // `trust proxy` (TRUST_PROXY) makes this the real client IP behind the load balancer.
    ipAddress: request.ip ?? 'unknown',
    userAgent: typeof agent === 'string' ? agent.slice(0, 256) : null,
  };
}
