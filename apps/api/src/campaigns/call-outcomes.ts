import { Inject, Injectable } from '@nestjs/common';
import {
  callAttempts,
  campaignLeads,
  campaigns,
  contacts,
  leadStatusChanges,
  leads,
  suppressionEntries,
  type CallOutcome,
  type Database,
} from '@nivomi/database';
import { and, eq, sql } from 'drizzle-orm';
import { Clock } from '../compliance/clock.js';
import { projectTelecomConsent, recordTelecomConsent } from '../compliance/consent-ledger.js';
import { DATABASE } from '../database/database.module.js';
import { leadStatusAfterCall, RETRYABLE_OUTCOMES } from './campaign-policy.js';

export interface CallOutcomeEvent {
  readonly attemptId: string;
  readonly providerCallId?: string | null | undefined;
  readonly outcome: CallOutcome;
  readonly durationSeconds: number;
}

/**
 * Applies a call's outcome exactly once (ADR-021): only an attempt still DIALING changes, so a
 * replayed provider event is a no-op. Updates budget use, the lead's run state (retry or done),
 * the Lead Status (addendum §4, FR-25) and, for an opt-out, suppression and consent (FR-51).
 */
@Injectable()
export class CallOutcomeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async apply(event: CallOutcomeEvent): Promise<{ applied: boolean }> {
    const now = this.clock.now();
    const duration = Math.max(0, Math.round(event.durationSeconds));
    return this.db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(callAttempts)
        .where(eq(callAttempts.id, event.attemptId))
        .for('update');
      if (!attempt || attempt.status !== 'DIALING') return { applied: false };
      if (
        event.providerCallId &&
        attempt.providerCallId &&
        attempt.providerCallId !== event.providerCallId
      ) {
        return { applied: false }; // not this attempt's call
      }

      await tx
        .update(callAttempts)
        .set({
          status: 'COMPLETED',
          outcome: event.outcome,
          durationSeconds: duration,
          endedAt: now,
          providerCallId: attempt.providerCallId ?? event.providerCallId ?? null,
        })
        .where(eq(callAttempts.id, attempt.id));

      const [campaign] = await tx
        .update(campaigns)
        .set({ usedSeconds: sql`${campaigns.usedSeconds} + ${duration}` })
        .where(eq(campaigns.id, attempt.campaignId))
        .returning();
      if (!campaign) return { applied: true };

      const [runState] = await tx
        .select()
        .from(campaignLeads)
        .where(eq(campaignLeads.id, attempt.campaignLeadId))
        .for('update');
      const retry =
        RETRYABLE_OUTCOMES.has(event.outcome) && attempt.attemptNumber < campaign.maxAttempts;
      if (runState?.state === 'IN_CALL') {
        await tx
          .update(campaignLeads)
          .set(
            retry
              ? {
                  state: 'WAITING',
                  lastOutcome: event.outcome,
                  nextAttemptAt: new Date(now.getTime() + campaign.retryIntervalMinutes * 60_000),
                  dialToken: null,
                }
              : { state: 'DONE', lastOutcome: event.outcome, nextAttemptAt: null, dialToken: null },
          )
          .where(eq(campaignLeads.id, runState.id));
      }

      const [lead] = await tx
        .select({
          id: leads.id,
          status: leads.status,
          contactId: leads.contactId,
          memberStatusChangedAt: leads.memberStatusChangedAt,
          phoneE164: contacts.phoneE164,
        })
        .from(leads)
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .where(and(eq(leads.id, attempt.leadId), eq(leads.organizationId, attempt.organizationId)))
        .for('update', { of: leads });
      if (!lead) return { applied: true };

      if (event.outcome === 'OPTED_OUT') {
        // FR-51: suppressed before anything else, consent revoked, 90-day block starts (ledger).
        await tx
          .insert(suppressionEntries)
          .values({
            organizationId: attempt.organizationId,
            phoneE164: attempt.toPhoneE164,
            source: 'IN_CALL_OPT_OUT',
            reason: 'Asked not to be called again during a call',
          })
          .onConflictDoNothing();
        const revoked = await recordTelecomConsent(tx, {
          organizationId: attempt.organizationId,
          contactId: lead.contactId,
          leadId: lead.id,
          phoneE164: attempt.toPhoneE164,
          kind: 'REVOCATION',
          source: 'IN_CALL_OPT_OUT',
          note: 'Opt-out during a call',
          recordedByUserId: null,
          eventKey: `call-opt-out:${attempt.id}`,
        });
        if (revoked) await projectTelecomConsent(tx, lead.id, { kind: 'REVOCATION' });
      }

      // FR-25: a Member's change made after the call started is never overwritten.
      const memberChangedLater =
        lead.memberStatusChangedAt !== null && lead.memberStatusChangedAt > attempt.createdAt;
      const next = leadStatusAfterCall(lead.status, event.outcome, !retry);
      if (next && (!memberChangedLater || event.outcome === 'OPTED_OUT')) {
        const inserted = await tx
          .insert(leadStatusChanges)
          .values({
            organizationId: attempt.organizationId,
            leadId: lead.id,
            fromStatus: lead.status,
            toStatus: next,
            source: 'AI_CALL',
            reason: `Call outcome ${event.outcome}`,
            eventKey: `call:${attempt.id}`,
          })
          .onConflictDoNothing()
          .returning({ id: leadStatusChanges.id });
        if (inserted.length > 0) {
          await tx.update(leads).set({ status: next }).where(eq(leads.id, lead.id));
        }
      }
      return { applied: true };
    });
  }
}
