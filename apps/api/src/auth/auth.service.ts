import { Inject, Injectable } from '@nestjs/common';
import {
  emailVerificationTokens,
  organizationMembers,
  passwordResetTokens,
  refreshTokens,
  sessions,
  users,
  type Database,
} from '@nivomi/database';
import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { JobQueue } from '../jobs/jobs.js';
import { RATE_LIMITS, RateLimiter } from '../security/rate-limit.js';
import { SESSION_TTL_SECONDS } from './cookies.js';
import { hashPassword, passwordProblem, verifyAgainstDummy, verifyPassword } from './password.js';
import type { Principal } from './principal.js';
import { TokenService, generateOpaqueToken, hashToken } from './tokens.js';

export const AUTH_JOBS = {
  sendVerificationEmail: 'email.verify-email',
  sendPasswordResetEmail: 'email.password-reset',
} as const;

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60_000;
/** A reused refresh token within this window is a concurrent refresh, not theft (ADR-018). */
export const REFRESH_REUSE_GRACE_MS = 30_000;

const INVALID_LINK = 'This link is invalid or has expired. Request a new one.';

export interface IssuedTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface SessionView {
  readonly id: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly current: boolean;
}

const emailHash = (email: string) => hashToken(`email:${email}`).slice(0, 16);

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly tokens: TokenService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly jobs: JobQueue,
  ) {}

  /**
   * Creates an account and queues the verification email. The response is identical whether or
   * not the email is already registered, so accounts cannot be enumerated.
   */
  async register(
    input: { name: string; email: string; password: string },
    context: ClientContext,
  ): Promise<void> {
    await this.limiter.consume(RATE_LIMITS.registerPerIp, context.ipAddress);
    const problem = passwordProblem(input.password, input.email);
    if (problem) {
      throw new AppError('VALIDATION_ERROR', problem, { details: [`password: ${problem}`] });
    }

    const [existing] = await this.db
      .select({ id: users.id, verified: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing) {
      // Email verification is intentionally disabled for the current MVP phase (owner decision,
      // 2026-10-04). The /verify-email endpoint is still functional for later re-enablement;
      // registration simply marks accounts as verified at creation and skips the email job.
      // Re-enable alongside ADR-024 in Phase 0 before the first production tenant.
      //   if (!existing.verified) {
      //     await this.jobs.enqueue({
      //       type: AUTH_JOBS.sendVerificationEmail,
      //       payload: { userId: existing.id },
      //     });
      //   }
      return;
    }

    const passwordHash = await hashPassword(input.password);
    await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(users)
        .values({
          email: input.email,
          name: input.name,
          passwordHash,
          // Email verification disabled for the MVP; see comment above.
          emailVerifiedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: users.id });
      const user = inserted[0];
      if (!user) return; // concurrent registration of the same email: same generic response
      // Email verification disabled for the MVP — no verify-email job enqueued at signup.
      //   await this.jobs.enqueue(
      //     { type: AUTH_JOBS.sendVerificationEmail, payload: { userId: user.id } },
      //     tx,
      //   );
      await this.audit.record(
        {
          action: 'auth.registered',
          actorUserId: user.id,
          resourceType: 'user',
          resourceId: user.id,
        },
        context,
        tx,
      );
    });
  }

  async verifyEmail(token: string, context: ClientContext): Promise<void> {
    await this.limiter.consume(RATE_LIMITS.tokenRedeemPerIp, context.ipAddress);
    await this.db.transaction(async (tx) => {
      const [record] = await tx
        .update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(emailVerificationTokens.tokenHash, hashToken(token)),
            isNull(emailVerificationTokens.usedAt),
            gt(emailVerificationTokens.expiresAt, new Date()),
          ),
        )
        .returning({ userId: emailVerificationTokens.userId });
      if (!record) throw new AppError('VALIDATION_ERROR', INVALID_LINK);
      await tx
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(and(eq(users.id, record.userId), isNull(users.emailVerifiedAt)));
      await this.audit.record(
        {
          action: 'auth.email_verified',
          actorUserId: record.userId,
          resourceType: 'user',
          resourceId: record.userId,
        },
        context,
        tx,
      );
    });
  }

  async resendVerification(principal: Principal): Promise<void> {
    if (principal.emailVerified) return;
    await this.limiter.consume(RATE_LIMITS.verificationPerUser, principal.userId);
    await this.jobs.enqueue({
      type: AUTH_JOBS.sendVerificationEmail,
      payload: { userId: principal.userId },
    });
  }

  async login(
    input: { email: string; password: string },
    context: ClientContext,
  ): Promise<IssuedTokens> {
    await this.limiter.consume(RATE_LIMITS.loginPerIp, context.ipAddress);
    await this.limiter.consume(RATE_LIMITS.loginPerEmail, input.email);

    const [user] = await this.db.select().from(users).where(eq(users.email, input.email)).limit(1);
    const invalid = new AppError('AUTHENTICATION_ERROR', 'Email or password is incorrect.');

    if (!user) {
      await verifyAgainstDummy(input.password);
      await this.audit.record(
        {
          action: 'auth.login_failed',
          metadata: { reason: 'unknown_email', emailHash: emailHash(input.email) },
        },
        context,
      );
      throw invalid;
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AppError('ACCOUNT_LOCKED', 'Too many failed attempts. Please try again later.', {
        retryAfterSeconds: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000),
      });
    }

    if (!(await verifyPassword(user.passwordHash, input.password))) {
      const failures = user.failedLoginCount + 1;
      const lock = failures >= MAX_FAILED_LOGINS;
      await this.db
        .update(users)
        .set(
          lock
            ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) }
            : { failedLoginCount: failures },
        )
        .where(eq(users.id, user.id));
      await this.audit.record(
        {
          action: lock ? 'auth.account_locked' : 'auth.login_failed',
          actorUserId: user.id,
          resourceType: 'user',
          resourceId: user.id,
          metadata: { reason: 'bad_password', failures },
        },
        context,
      );
      throw invalid;
    }

    return this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, user.id));
      const [latest] = await tx
        .select({ organizationId: organizationMembers.organizationId })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, user.id))
        .orderBy(desc(organizationMembers.createdAt))
        .limit(1);
      const issued = await this.startSession(tx, user.id, latest?.organizationId ?? null, context);
      await this.audit.record(
        {
          action: 'auth.login_succeeded',
          actorUserId: user.id,
          resourceType: 'session',
          resourceId: issued.sessionId,
        },
        context,
        tx,
      );
      return { accessToken: issued.accessToken, refreshToken: issued.refreshToken };
    });
  }

  /** Rotates the refresh token; detects reuse of an already-rotated token (ADR-018). */
  async refresh(refreshToken: string, context: ClientContext): Promise<IssuedTokens> {
    await this.limiter.consume(RATE_LIMITS.refreshPerIp, context.ipAddress);
    const signIn = new AppError(
      'AUTHENTICATION_ERROR',
      'Your session has ended. Please sign in again.',
    );

    const [row] = await this.db
      .select({ token: refreshTokens, session: sessions })
      .from(refreshTokens)
      .innerJoin(sessions, eq(sessions.id, refreshTokens.sessionId))
      .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)))
      .limit(1);
    if (!row) throw signIn;
    const { token, session } = row;
    const now = Date.now();
    if (
      session.revokedAt ||
      session.expiresAt.getTime() <= now ||
      token.expiresAt.getTime() <= now
    ) {
      throw signIn;
    }

    if (token.usedAt) {
      if (now - token.usedAt.getTime() <= REFRESH_REUSE_GRACE_MS) {
        throw new AppError('REFRESH_CONFLICT', 'Your session was just refreshed. Please retry.');
      }
      await this.revokeSession(session.id, 'refresh_token_reuse');
      await this.audit.record(
        {
          action: 'auth.refresh_token_reuse_detected',
          actorUserId: session.userId,
          resourceType: 'session',
          resourceId: session.id,
        },
        context,
      );
      throw signIn;
    }

    return this.db.transaction(async (tx) => {
      // Conditional update: of two concurrent refreshes with the same token, exactly one wins.
      const [claimed] = await tx
        .update(refreshTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(refreshTokens.id, token.id), isNull(refreshTokens.usedAt)))
        .returning({ id: refreshTokens.id });
      if (!claimed) {
        throw new AppError('REFRESH_CONFLICT', 'Your session was just refreshed. Please retry.');
      }
      const next = generateOpaqueToken();
      const [inserted] = await tx
        .insert(refreshTokens)
        .values({ sessionId: session.id, tokenHash: next.hash, expiresAt: session.expiresAt })
        .returning({ id: refreshTokens.id });
      await tx
        .update(refreshTokens)
        .set({ replacedById: inserted?.id ?? null })
        .where(eq(refreshTokens.id, token.id));
      const accessToken = await this.tokens.signAccessToken({
        userId: session.userId,
        sessionId: session.id,
      });
      return { accessToken, refreshToken: next.token };
    });
  }

  /** Ends the current session (by access-token principal or by refresh token). Idempotent. */
  async logout(
    principal: Principal | undefined,
    refreshToken: string | undefined,
    context: ClientContext,
  ): Promise<void> {
    let sessionId = principal?.sessionId;
    let userId = principal?.userId;
    if (!sessionId && refreshToken) {
      const [row] = await this.db
        .select({ sessionId: sessions.id, userId: sessions.userId })
        .from(refreshTokens)
        .innerJoin(sessions, eq(sessions.id, refreshTokens.sessionId))
        .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)))
        .limit(1);
      sessionId = row?.sessionId;
      userId = row?.userId;
    }
    if (!sessionId) return;
    await this.revokeSession(sessionId, 'logout');
    await this.audit.record(
      {
        action: 'auth.logout',
        actorUserId: userId ?? null,
        resourceType: 'session',
        resourceId: sessionId,
      },
      context,
    );
  }

  /** Always answers the same way; queues the reset email only for existing accounts. */
  async forgotPassword(email: string, context: ClientContext): Promise<void> {
    await this.limiter.consume(RATE_LIMITS.passwordResetPerIp, context.ipAddress);
    await this.limiter.consume(RATE_LIMITS.passwordResetPerEmail, email);
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user) return;
    await this.jobs.enqueue({
      type: AUTH_JOBS.sendPasswordResetEmail,
      payload: { userId: user.id },
    });
    await this.audit.record(
      {
        action: 'auth.password_reset_requested',
        actorUserId: user.id,
        resourceType: 'user',
        resourceId: user.id,
      },
      context,
    );
  }

  /** Sets a new password from a reset link; revokes every session of the account. */
  async resetPassword(token: string, password: string, context: ClientContext): Promise<void> {
    await this.limiter.consume(RATE_LIMITS.tokenRedeemPerIp, context.ipAddress);
    await this.db.transaction(async (tx) => {
      const [record] = await tx
        .select({
          id: passwordResetTokens.id,
          userId: passwordResetTokens.userId,
          email: users.email,
        })
        .from(passwordResetTokens)
        .innerJoin(users, eq(users.id, passwordResetTokens.userId))
        .where(
          and(
            eq(passwordResetTokens.tokenHash, hashToken(token)),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!record) throw new AppError('VALIDATION_ERROR', INVALID_LINK);
      const problem = passwordProblem(password, record.email);
      if (problem) {
        throw new AppError('VALIDATION_ERROR', problem, { details: [`password: ${problem}`] });
      }
      const now = new Date();
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(eq(passwordResetTokens.userId, record.userId), isNull(passwordResetTokens.usedAt)),
        );
      await tx
        .update(users)
        .set({
          passwordHash: await hashPassword(password),
          failedLoginCount: 0,
          lockedUntil: null,
          // Completing a reset proves control of the inbox.
          emailVerifiedAt: now,
        })
        .where(eq(users.id, record.userId));
      await tx
        .update(sessions)
        .set({ revokedAt: now, revokedReason: 'password_reset' })
        .where(and(eq(sessions.userId, record.userId), isNull(sessions.revokedAt)));
      await this.audit.record(
        {
          action: 'auth.password_reset_completed',
          actorUserId: record.userId,
          resourceType: 'user',
          resourceId: record.userId,
        },
        context,
        tx,
      );
    });
  }

  /** Changes the password and signs out every other session. */
  async changePassword(
    principal: Principal,
    input: { currentPassword: string; newPassword: string },
    context: ClientContext,
  ): Promise<void> {
    await this.limiter.consume(RATE_LIMITS.loginPerEmail, principal.email);
    const [user] = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, principal.userId))
      .limit(1);
    if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new AppError('AUTHENTICATION_ERROR', 'Your current password is incorrect.');
    }
    const problem = passwordProblem(input.newPassword, principal.email);
    if (problem) {
      throw new AppError('VALIDATION_ERROR', problem, { details: [`newPassword: ${problem}`] });
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, principal.userId));
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: 'password_changed' })
        .where(
          and(
            eq(sessions.userId, principal.userId),
            ne(sessions.id, principal.sessionId),
            isNull(sessions.revokedAt),
          ),
        );
      await this.audit.record(
        {
          action: 'auth.password_changed',
          actorUserId: principal.userId,
          resourceType: 'user',
          resourceId: principal.userId,
        },
        context,
        tx,
      );
    });
  }

  async listSessions(principal: Principal): Promise<SessionView[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, principal.userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sessions.lastSeenAt))
      .limit(100);
    return rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      current: row.id === principal.sessionId,
    }));
  }

  async revokeOwnSession(
    principal: Principal,
    sessionId: string,
    context: ClientContext,
  ): Promise<void> {
    const [owned] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, principal.userId)))
      .limit(1);
    if (!owned) throw new AppError('NOT_FOUND', 'Session not found.');
    await this.revokeSession(sessionId, 'revoked_by_user');
    await this.audit.record(
      {
        action: 'auth.session_revoked',
        actorUserId: principal.userId,
        resourceType: 'session',
        resourceId: sessionId,
      },
      context,
    );
  }

  private async startSession(
    tx: Database,
    userId: string,
    activeOrganizationId: string | null,
    context: ClientContext,
  ): Promise<IssuedTokens & { sessionId: string }> {
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    const [session] = await tx
      .insert(sessions)
      .values({
        userId,
        activeOrganizationId,
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      })
      .returning({ id: sessions.id });
    if (!session) throw new Error('session insert returned no row');
    const refresh = generateOpaqueToken();
    await tx
      .insert(refreshTokens)
      .values({ sessionId: session.id, tokenHash: refresh.hash, expiresAt });
    const accessToken = await this.tokens.signAccessToken({ userId, sessionId: session.id });
    return { sessionId: session.id, accessToken, refreshToken: refresh.token };
  }

  private async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }
}
