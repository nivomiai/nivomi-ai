import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  emailVerificationTokens,
  passwordResetTokens,
  users,
  type Database,
} from '@nivomi/database';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import {
  EMAIL_PROVIDER,
  passwordResetEmail,
  verificationEmail,
  type EmailProvider,
} from '../email/email.js';
import { JobHandlerRegistry } from '../jobs/jobs.js';
import { AUTH_JOBS } from './auth.service.js';
import { generateOpaqueToken } from './tokens.js';

const VERIFICATION_TTL_MS = 24 * 60 * 60_000;
const RESET_TTL_MS = 60 * 60_000;
const userPayload = z.object({ userId: z.uuid() });

/**
 * Background handlers for auth emails. Tokens are created here, at send time, so raw tokens never
 * sit in the jobs table.
 */
@Injectable()
export class AuthEmailJobs implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(AUTH_JOBS.sendVerificationEmail, (payload) =>
      this.sendVerification(userPayload.parse(payload).userId),
    );
    this.registry.register(AUTH_JOBS.sendPasswordResetEmail, (payload) =>
      this.sendPasswordReset(userPayload.parse(payload).userId),
    );
  }

  private async sendVerification(userId: string): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.emailVerifiedAt) return;
    const token = generateOpaqueToken();
    await this.db.transaction(async (tx) => {
      // Only the newest link works.
      await tx
        .update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(
          and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)),
        );
      await tx.insert(emailVerificationTokens).values({
        userId,
        tokenHash: token.hash,
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      });
    });
    const link = `${this.env.APP_WEB_URL}/verify-email?token=${token.token}`;
    await this.email.send(verificationEmail(user.email, user.name, link), this.env.EMAIL_FROM);
  }

  private async sendPasswordReset(userId: string): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return;
    const token = generateOpaqueToken();
    await this.db.insert(passwordResetTokens).values({
      userId,
      tokenHash: token.hash,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    const link = `${this.env.APP_WEB_URL}/reset-password?token=${token.token}`;
    await this.email.send(passwordResetEmail(user.email, user.name, link), this.env.EMAIL_FROM);
  }
}
