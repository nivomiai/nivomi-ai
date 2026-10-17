import { Inject, Injectable } from '@nestjs/common';
import { userWelcomeSurveys, type Database } from '@nivomi/database';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { Principal } from '../auth/principal.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';

/** Allowed answers; the web app shows a label for each. Every question is required. */
export const welcomeSurveySchema = z.object({
  role: z.enum([
    'business_owner',
    'sales',
    'marketing',
    'operations',
    'developer',
    'agency',
    'other',
  ]),
  callVolume: z.enum(['under_1k', '1k_10k', '10k_50k', 'over_50k', 'not_sure']),
  migratingFrom: z.enum(['new', 'voice_ai', 'call_center', 'dialer', 'other']),
  referralSource: z.enum(['search', 'social', 'referral', 'event', 'ai_assistant', 'other']),
});

export type WelcomeSurveyAnswers = z.output<typeof welcomeSurveySchema>;

/** The one-time welcome survey a person answers after their first sign-in. */
@Injectable()
export class WelcomeSurveyService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async isPending(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: userWelcomeSurveys.userId })
      .from(userWelcomeSurveys)
      .where(eq(userWelcomeSurveys.userId, userId))
      .limit(1);
    return !row;
  }

  /** Idempotent: answering again replaces the answers; only the first answer is audited. */
  async submit(
    principal: Principal,
    answers: WelcomeSurveyAnswers,
    context: ClientContext,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const created = await tx
        .insert(userWelcomeSurveys)
        .values({ userId: principal.userId, ...answers })
        .onConflictDoNothing()
        .returning({ userId: userWelcomeSurveys.userId });
      if (created.length === 0) {
        await tx
          .update(userWelcomeSurveys)
          .set(answers)
          .where(eq(userWelcomeSurveys.userId, principal.userId));
        return;
      }
      await this.audit.record(
        {
          action: 'user.welcome_survey_completed',
          actorUserId: principal.userId,
          organizationId: principal.membership?.organizationId ?? null,
          resourceType: 'user',
          resourceId: principal.userId,
          metadata: { ...answers },
        },
        context,
        tx,
      );
    });
  }
}
