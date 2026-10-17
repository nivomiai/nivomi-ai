import { Inject, Injectable } from '@nestjs/common';
import {
  agentVersions,
  callerNumbers,
  inboundBindings,
  type Database,
  type InboundMode,
} from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { TenantPrincipal } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';

/** The tenant-visible shape of a per-number inbound config. */
export interface InboundConfigView {
  readonly callerNumberId: string;
  readonly phoneE164: string;
  readonly mode: InboundMode;
  readonly agentVersionId: string | null;
  readonly handoffE164: string | null;
  readonly updatedAt: string | null;
}

export interface UpsertInboundConfigInput {
  readonly mode: InboundMode;
  /** Required when mode='AI'. */
  readonly agentVersionId?: string | null;
  /** Required when mode='HUMAN'. */
  readonly handoffE164?: string | null;
}

/**
 * Per-number inbound config (ADR-024 §1). Tenant-scoped reads/writes. Mode selects the inbound
 * runtime path: AI (turn-based conversation with `agentVersionId`) or HUMAN (`<Dial>` to
 * `handoffE164`). Changes are audited so operators can see when a number was flipped.
 */
@Injectable()
export class InboundBindingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async get(tenant: TenantPrincipal, callerNumberId: string): Promise<InboundConfigView> {
    const number = await this.loadNumber(tenant.membership.organizationId, callerNumberId);
    const [row] = await this.db
      .select({
        mode: inboundBindings.mode,
        agentVersionId: inboundBindings.agentVersionId,
        handoffE164: inboundBindings.handoffE164,
        updatedAt: inboundBindings.updatedAt,
      })
      .from(inboundBindings)
      .where(eq(inboundBindings.callerNumberId, callerNumberId))
      .limit(1);
    return {
      callerNumberId,
      phoneE164: number.phoneE164,
      mode: row?.mode ?? 'AI',
      agentVersionId: row?.agentVersionId ?? null,
      handoffE164: row?.handoffE164 ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  async upsert(
    tenant: TenantPrincipal,
    callerNumberId: string,
    input: UpsertInboundConfigInput,
    context: ClientContext,
  ): Promise<InboundConfigView> {
    const orgId = tenant.membership.organizationId;
    const number = await this.loadNumber(orgId, callerNumberId);
    const normalized = this.normalize(input);
    if (normalized.mode === 'AI') {
      await this.assertAgentVersionOwned(orgId, normalized.agentVersionId);
    }

    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: inboundBindings.id })
        .from(inboundBindings)
        .where(eq(inboundBindings.callerNumberId, callerNumberId))
        .limit(1);
      if (existing) {
        await tx
          .update(inboundBindings)
          .set({
            mode: normalized.mode,
            agentVersionId: normalized.agentVersionId,
            handoffE164: normalized.handoffE164,
          })
          .where(eq(inboundBindings.id, existing.id));
      } else {
        await tx.insert(inboundBindings).values({
          organizationId: orgId,
          callerNumberId,
          mode: normalized.mode,
          agentVersionId: normalized.agentVersionId,
          handoffE164: normalized.handoffE164,
        });
      }
    });

    await this.audit.record(
      {
        action: 'voice.inbound_config_updated',
        organizationId: orgId,
        actorUserId: tenant.userId,
        resourceType: 'caller_number',
        resourceId: callerNumberId,
        metadata: {
          mode: normalized.mode,
          agentVersionId: normalized.agentVersionId,
          hasHandoff: Boolean(normalized.handoffE164),
          phoneE164: number.phoneE164,
        },
      },
      context,
    );

    return this.get(tenant, callerNumberId);
  }

  async delete(
    tenant: TenantPrincipal,
    callerNumberId: string,
    context: ClientContext,
  ): Promise<void> {
    const orgId = tenant.membership.organizationId;
    await this.loadNumber(orgId, callerNumberId);
    const deleted = await this.db
      .delete(inboundBindings)
      .where(eq(inboundBindings.callerNumberId, callerNumberId))
      .returning({ id: inboundBindings.id });
    if (deleted.length === 0) return;
    await this.audit.record(
      {
        action: 'voice.inbound_config_cleared',
        organizationId: orgId,
        actorUserId: tenant.userId,
        resourceType: 'caller_number',
        resourceId: callerNumberId,
      },
      context,
    );
  }

  private async loadNumber(
    organizationId: string,
    callerNumberId: string,
  ): Promise<{ phoneE164: string }> {
    const [row] = await this.db
      .select({ phoneE164: callerNumbers.phoneE164 })
      .from(callerNumbers)
      .where(
        and(
          eq(callerNumbers.id, callerNumberId),
          eq(callerNumbers.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!row) throw new AppError('NOT_FOUND', 'Caller number not found for this organization.');
    return row;
  }

  private async assertAgentVersionOwned(organizationId: string, agentVersionId: string | null) {
    if (!agentVersionId) {
      throw new AppError('VALIDATION_ERROR', 'An agent version is required for AI mode.');
    }
    const [row] = await this.db
      .select({ id: agentVersions.id })
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.id, agentVersionId),
          eq(agentVersions.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new AppError(
        'VALIDATION_ERROR',
        'That agent version does not belong to this organization.',
      );
    }
  }

  private normalize(input: UpsertInboundConfigInput): {
    mode: InboundMode;
    agentVersionId: string | null;
    handoffE164: string | null;
  } {
    if (input.mode === 'AI') {
      if (!input.agentVersionId) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Choose a published agent version for AI inbound mode.',
        );
      }
      return {
        mode: 'AI',
        agentVersionId: input.agentVersionId,
        handoffE164: input.handoffE164 ? normalizeE164(input.handoffE164) : null,
      };
    }
    const handoff = input.handoffE164 ? normalizeE164(input.handoffE164) : null;
    if (!handoff) {
      throw new AppError(
        'VALIDATION_ERROR',
        'A forward-to number is required for human inbound mode.',
      );
    }
    return { mode: 'HUMAN', agentVersionId: null, handoffE164: handoff };
  }
}

/**
 * Accepts a few common Indian input shapes (10-digit mobile, trunk-0 national format, raw E.164)
 * and returns a validated `+91…` E.164 string. The tenant UI only accepts India today; multi-
 * country handoff goes through the ComplianceEngine when international dialing lands.
 */
function normalizeE164(raw: string): string {
  const trimmed = raw.trim();
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0') && /^0[2-9]/.test(digits)) {
    return `+91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  throw new AppError(
    'VALIDATION_ERROR',
    'Forward-to number must be a valid 10-digit Indian number or in +91 E.164 format.',
  );
}
