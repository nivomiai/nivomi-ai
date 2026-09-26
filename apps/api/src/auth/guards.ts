import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { organizationMembers, sessions, users, type Database } from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import { roleHasPermission, type Permission } from '../authorization/permissions.js';
import { AppError } from '../common/errors.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import { RATE_LIMITS, RateLimiter } from '../security/rate-limit.js';
import { ACCESS_COOKIE, REFRESH_COOKIE, readCookie } from './cookies.js';
import {
  ALLOW_UNVERIFIED,
  IS_PUBLIC,
  REQUIRED_PERMISSION,
  type AuthenticatedRequest,
  type Principal,
} from './principal.js';
import { TokenService } from './tokens.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HEALTH_PATH = /^\/api\/v\d+\/health(\/ready)?(\?|$)/;
/** Refresh `last_seen_at` at most this often per session, to avoid a write on every request. */
const LAST_SEEN_RESOLUTION_MS = 5 * 60_000;

/** Coarse per-IP limit for the whole API; stricter per-endpoint rules live in the services. */
@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!HEALTH_PATH.test(request.originalUrl)) {
      await this.limiter.consume(RATE_LIMITS.apiPerIp, request.ip ?? 'unknown');
    }
    return true;
  }
}

/**
 * CSRF defence (ADR-018): state-changing requests from a browser must come from an allowed
 * origin. Combined with SameSite cookies this blocks cross-site form and fetch attacks.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(request.method)) return true;
    const origin = request.headers.origin;
    const usesCookies =
      readCookie(request, ACCESS_COOKIE) !== undefined ||
      readCookie(request, REFRESH_COOKIE) !== undefined;
    if (origin === undefined && !usesCookies) return true; // non-browser client, no ambient credentials
    if (origin !== undefined && this.env.CORS_ALLOWED_ORIGINS.includes(origin)) return true;
    throw new AppError('AUTHORIZATION_ERROR', 'This request origin is not allowed.');
  }
}

/** Resolves the caller from the access token and enforces verification and permissions. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const targets = [context.getHandler(), context.getClass()];

    const token = readCookie(request, ACCESS_COOKIE) ?? bearerToken(request);
    if (token) {
      const principal = await this.resolve(token);
      if (principal) request.principal = principal;
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const principal = request.principal;
    if (!principal) {
      throw new AppError('AUTHENTICATION_ERROR', 'Please sign in.');
    }
    if (
      !principal.emailVerified &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED, targets)
    ) {
      throw new AppError('EMAIL_NOT_VERIFIED', 'Please verify your email address first.');
    }
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRED_PERMISSION,
      targets,
    );
    if (permission) {
      if (!principal.membership) {
        throw new AppError('ORGANIZATION_REQUIRED', 'Select or create an organization first.');
      }
      if (!roleHasPermission(principal.membership.role, permission)) {
        throw new AppError('AUTHORIZATION_ERROR', 'You do not have permission to do this.');
      }
    }
    return true;
  }

  private async resolve(token: string): Promise<Principal | null> {
    const claims = await this.tokens.verifyAccessToken(token);
    if (!claims) return null;

    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        revokedAt: sessions.revokedAt,
        expiresAt: sessions.expiresAt,
        lastSeenAt: sessions.lastSeenAt,
        activeOrganizationId: sessions.activeOrganizationId,
        userId: users.id,
        email: users.email,
        name: users.name,
        emailVerifiedAt: users.emailVerifiedAt,
        isSuperAdmin: users.isSuperAdmin,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, claims.sessionId), eq(sessions.userId, claims.userId)))
      .limit(1);

    const now = Date.now();
    if (!row || row.revokedAt || row.expiresAt.getTime() <= now) return null;

    let membership: Principal['membership'] = null;
    if (row.activeOrganizationId) {
      const [member] = await this.db
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, row.activeOrganizationId),
            eq(organizationMembers.userId, row.userId),
          ),
        )
        .limit(1);
      // Membership is re-checked on every request: removal takes effect immediately.
      if (member) membership = { organizationId: row.activeOrganizationId, role: member.role };
    }

    if (now - row.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
      await this.db
        .update(sessions)
        .set({ lastSeenAt: new Date(now) })
        .where(eq(sessions.id, row.sessionId));
    }

    return {
      userId: row.userId,
      sessionId: row.sessionId,
      email: row.email,
      name: row.name,
      emailVerified: row.emailVerifiedAt !== null,
      isSuperAdmin: row.isSuperAdmin,
      membership,
    };
  }
}

function bearerToken(request: AuthenticatedRequest): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}
