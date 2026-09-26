import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { organizationInvitations, organizations, users, type Database } from '@nivomi/database';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { generateOpaqueToken } from '../auth/tokens.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import { EMAIL_PROVIDER, invitationEmail, type EmailProvider } from '../email/email.js';
import { JobHandlerRegistry } from '../jobs/jobs.js';
import { ORGANIZATION_JOBS } from './organizations.service.js';

const invitationPayload = z.object({ invitationId: z.uuid() });

/** Sends invitation emails. The redeemable token is minted here, so it never sits in the jobs table. */
@Injectable()
export class OrganizationJobs implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(ORGANIZATION_JOBS.sendInvitationEmail, (payload) =>
      this.sendInvitation(invitationPayload.parse(payload).invitationId),
    );
  }

  private async sendInvitation(invitationId: string): Promise<void> {
    const [row] = await this.db
      .select({
        email: organizationInvitations.email,
        organizationName: organizations.name,
        inviterName: users.name,
      })
      .from(organizationInvitations)
      .innerJoin(organizations, eq(organizations.id, organizationInvitations.organizationId))
      .leftJoin(users, eq(users.id, organizationInvitations.invitedByUserId))
      .where(
        and(
          eq(organizationInvitations.id, invitationId),
          isNull(organizationInvitations.acceptedAt),
          isNull(organizationInvitations.revokedAt),
          gt(organizationInvitations.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!row) return; // revoked, accepted or expired before the email went out

    // A retry re-mints the token, so only the link in the latest email works.
    const token = generateOpaqueToken();
    await this.db
      .update(organizationInvitations)
      .set({ tokenHash: token.hash })
      .where(eq(organizationInvitations.id, invitationId));
    const link = `${this.env.APP_WEB_URL}/invite?token=${token.token}`;
    await this.email.send(
      invitationEmail(row.email, row.organizationName, row.inviterName ?? 'A teammate', link),
      this.env.EMAIL_FROM,
    );
  }
}
