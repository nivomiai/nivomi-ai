import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { users, type Database } from '@nivomi/database';
import { eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';

export type BootstrapOutcome = 'disabled' | 'promoted' | 'already' | 'not_found' | 'refused';

/**
 * Promotes the first platform Super Admin from `PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL` at startup,
 * without opening the database to the internet. It only promotes an existing account (the owner
 * signs up first with their own password) and only while no Super Admin exists: email
 * verification is off in the MVP, so an address alone must never grant the flag once a Super Admin
 * can promote others through the audited platform API. Remove the variable once it has applied.
 */
@Injectable()
export class SuperAdminBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminBootstrap.name);

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const outcome = await this.run();
    if (outcome === 'disabled') return;
    const messages: Record<Exclude<BootstrapOutcome, 'disabled'>, string> = {
      promoted: 'Bootstrap Super Admin granted; remove PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL.',
      already:
        'Bootstrap Super Admin already granted; remove PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL.',
      not_found: 'Bootstrap Super Admin skipped: no account with that email. Sign up first.',
      refused: 'Bootstrap Super Admin refused: a Super Admin already exists; use the platform API.',
    };
    const log = outcome === 'promoted' || outcome === 'already' ? 'log' : 'warn';
    this.logger[log](messages[outcome]);
  }

  async run(): Promise<BootstrapOutcome> {
    const email = this.env.PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL;
    if (!email) return 'disabled';
    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: users.id, isSuperAdmin: users.isSuperAdmin })
        .from(users)
        .where(eq(users.email, email))
        .for('update');
      if (!target) return 'not_found';
      if (target.isSuperAdmin) return 'already';
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.isSuperAdmin, true))
        .limit(1);
      if (existing) return 'refused';
      await tx.update(users).set({ isSuperAdmin: true }).where(eq(users.id, target.id));
      await this.audit.record(
        {
          action: 'platform.user_promoted',
          organizationId: null,
          actorUserId: null,
          resourceType: 'user',
          resourceId: target.id,
          metadata: { email, via: 'bootstrap_env' },
        },
        undefined,
        tx,
      );
      return 'promoted';
    });
  }
}
