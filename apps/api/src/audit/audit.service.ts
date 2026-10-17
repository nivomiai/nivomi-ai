import { Inject, Injectable } from '@nestjs/common';
import { auditLogs, type Database } from '@nivomi/database';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../common/pagination.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';

/** Security and administrative actions recorded in the audit trail (PRD FR-122). */
export type AuditAction =
  | 'auth.registered'
  | 'auth.email_verified'
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.account_locked'
  | 'auth.logout'
  | 'auth.refresh_token_reuse_detected'
  | 'auth.password_reset_requested'
  | 'auth.password_reset_completed'
  | 'auth.password_changed'
  | 'auth.session_revoked'
  | 'organization.created'
  | 'organization.switched'
  | 'organization.member_removed'
  | 'organization.invitation_created'
  | 'organization.invitation_revoked'
  | 'organization.invitation_accepted'
  | 'platform.dev_seed_applied'
  | 'platform.organization_provisioned'
  | 'platform.organization_approved'
  | 'platform.organization_suspended'
  | 'platform.organization_reactivated'
  | 'platform.organization_closed'
  | 'platform.user_promoted'
  | 'platform.user_demoted'
  | 'platform.plan_created'
  | 'platform.plan_updated'
  | 'platform.plan_archived'
  | 'security.cross_tenant_access_denied'
  | 'lead.created'
  | 'lead.updated'
  | 'lead.status_changed'
  | 'suppression.added'
  | 'suppression.removed'
  | 'ingestion.review_resolved'
  | 'import.created'
  | 'import.confirmed'
  | 'import.cancelled'
  | 'import.error_report_downloaded'
  | 'crm.connected'
  | 'crm.connection_rejected'
  | 'crm.disconnected'
  | 'crm.settings_updated'
  | 'crm.sync_requested'
  | 'crm.token_invalid'
  | 'campaign.created'
  | 'campaign.updated'
  | 'campaign.prelaunch_requested'
  | 'campaign.launched'
  | 'campaign.paused'
  | 'campaign.auto_paused'
  | 'campaign.resumed'
  | 'campaign.stopped'
  | 'campaign.cancelled'
  | 'campaign.completed'
  | 'calling.emergency_stop_activated'
  | 'calling.emergency_stop_released'
  | 'telecom.identity_updated'
  | 'telecom.identity_submitted'
  | 'telecom.identity_verified'
  | 'telecom.identity_rejected'
  | 'telecom.number_added'
  | 'telecom.number_removed'
  | 'consent.recorded'
  | 'compliance.complaint_recorded'
  | 'compliance.breaker_tripped'
  | 'compliance.breaker_acknowledged'
  | 'compliance.breaker_cleared'
  | 'compliance.review_resolved'
  | 'agent.created'
  | 'agent.updated'
  | 'agent.published'
  | 'agent.archived'
  | 'agent.test_started';

export interface AuditEntry {
  readonly action: AuditAction;
  readonly organizationId?: string | null;
  readonly actorUserId?: string | null;
  readonly resourceType?: string;
  readonly resourceId?: string;
  /** Never include secrets, tokens or passwords. */
  readonly metadata?: Record<string, unknown>;
}

export interface PlatformAuditItem {
  id: string;
  action: string;
  organizationId: string | null;
  actorUserId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: Date;
}

export interface PlatformAuditPage {
  readonly items: readonly PlatformAuditItem[];
  readonly nextCursor: string | null;
}

export interface AuditPage {
  readonly items: readonly {
    id: string;
    action: string;
    actorUserId: string | null;
    resourceType: string | null;
    resourceId: string | null;
    metadata: Record<string, unknown> | null;
    ipAddress: string | null;
    requestId: string | null;
    createdAt: Date;
  }[];
  readonly nextCursor: string | null;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Records an entry; pass a transaction to commit it atomically with the change it describes. */
  async record(entry: AuditEntry, context?: ClientContext, db: Database = this.db): Promise<void> {
    await db.insert(auditLogs).values({
      action: entry.action,
      organizationId: entry.organizationId ?? null,
      actorUserId: entry.actorUserId ?? null,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      metadata: entry.metadata ?? null,
      requestId: context?.requestId ?? null,
      ipAddress: context?.ipAddress ?? null,
    });
  }

  /** Newest first, keyset-paginated by (created_at, id); never an unbounded result. */
  async listForOrganization(
    organizationId: string,
    options: { limit: number; cursor?: string | undefined },
  ): Promise<AuditPage> {
    const after = decodeCursor(options.cursor);
    const rows = await this.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorUserId: auditLogs.actorUserId,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        requestId: auditLogs.requestId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.organizationId, organizationId),
          after
            ? or(
                lt(auditLogs.createdAt, after.createdAt),
                and(eq(auditLogs.createdAt, after.createdAt), lt(auditLogs.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(options.limit + 1);

    const items = rows.slice(0, options.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > options.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /**
   * Platform-wide audit for the Super Admin console (FR-120). Never called from a tenant
   * endpoint. Returns platform events (`organizationId` null) and tenant events together, so
   * the console reads as one timeline.
   */
  async listPlatform(options: {
    limit: number;
    cursor?: string | undefined;
  }): Promise<PlatformAuditPage> {
    const after = decodeCursor(options.cursor);
    const rows = await this.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        organizationId: auditLogs.organizationId,
        actorUserId: auditLogs.actorUserId,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        requestId: auditLogs.requestId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        after
          ? or(
              lt(auditLogs.createdAt, after.createdAt),
              and(eq(auditLogs.createdAt, after.createdAt), lt(auditLogs.id, after.id)),
            )
          : undefined,
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(options.limit + 1);

    const items = rows.slice(0, options.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > options.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }
}
