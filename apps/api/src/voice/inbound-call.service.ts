import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  callSessions,
  callerNumbers,
  inboundBindings,
  organizations,
  type Database,
} from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import { Clock } from '../compliance/clock.js';
import { DATABASE } from '../database/database.module.js';
import { AiConversationService } from './ai-conversation.service.js';
import type {
  InboundCallContext,
  InboundDecision,
  StatusCallbackContext,
} from './inbound-decision.js';

/** Phone-number redaction for logs: keep last 4 digits only. */
export function maskPhone(e164: string | null): string {
  if (!e164) return 'unknown';
  const digits = e164.replace(/\D/g, '');
  if (digits.length <= 4) return `*${digits}`;
  return `*${digits.slice(-4)}`;
}

/** When the caller number has no inbound binding yet. Operators customize this per org later. */
function defaultWelcome(organizationName: string): string {
  return `Thank you for calling ${organizationName}. Our team will reach out to you shortly. Goodbye.`;
}

const UNKNOWN_NUMBER_PROMPT =
  'This number is not in service. Please check the number and try again.';

const SUSPENDED_ORG_PROMPT =
  'This line is temporarily unavailable. Please try again later or contact support.';

const AI_UNAVAILABLE_PROMPT =
  'Our automated voice agent is not available right now. Please try again later.';

/**
 * Decides what to do with an inbound call and records it. Pure business logic: provider parsing
 * (ExotelInboundParser) and provider rendering (ExoML) happen at the controller edge.
 *
 * AI leg mode (ADR-024, turn-based on Exotel free plan): when a Sarvam key is configured and the
 * organization is active, the call enters a `<Say>` + `<Record>` loop driven by
 * `AiConversationService`. When no Sarvam key is configured we fall back to the terminal
 * greeting + hangup. A streaming adapter (ADR-023) replaces the loop once Exotel `<Stream>` is on
 * the tenant's plan.
 */
@Injectable()
export class InboundCallService {
  private readonly logger = new Logger(InboundCallService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly ai: AiConversationService,
  ) {}

  async handleInbound(context: InboundCallContext): Promise<InboundDecision> {
    const [number] = await this.db
      .select({
        id: callerNumbers.id,
        organizationId: callerNumbers.organizationId,
        status: callerNumbers.status,
        phoneE164: callerNumbers.phoneE164,
      })
      .from(callerNumbers)
      .where(eq(callerNumbers.phoneE164, context.toE164))
      .limit(1);

    if (!number) {
      this.logger.warn(
        {
          event: 'voice.inbound.unknown_number',
          to: maskPhone(context.toE164),
          from: maskPhone(context.fromE164),
          callSid: context.providerCallSid,
        },
        'Inbound call to a number not assigned to any organization.',
      );
      return {
        action: 'reject',
        reason: 'unknown_number',
        prompt: UNKNOWN_NUMBER_PROMPT,
        voice: 'female',
      };
    }

    const [org] = await this.db
      .select({ id: organizations.id, name: organizations.name, status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, number.organizationId))
      .limit(1);

    if (!org || org.status === 'SUSPENDED' || org.status === 'CLOSED') {
      this.logger.warn(
        {
          event: 'voice.inbound.organization_blocked',
          organizationId: number.organizationId,
          status: org?.status ?? 'MISSING',
          callSid: context.providerCallSid,
        },
        'Inbound call to an organization that is not active.',
      );
      await this.persistSession(context, number.organizationId, number.id, 'organization_blocked');
      return {
        action: 'reject',
        reason: 'organization_blocked',
        prompt: SUSPENDED_ORG_PROMPT,
        voice: 'female',
      };
    }

    const [binding] = await this.db
      .select({
        mode: inboundBindings.mode,
        agentVersionId: inboundBindings.agentVersionId,
        handoffE164: inboundBindings.handoffE164,
      })
      .from(inboundBindings)
      .where(eq(inboundBindings.callerNumberId, number.id))
      .limit(1);

    // Explicit HUMAN mode: `<Dial>` the configured handoff number. No AI runs.
    if (binding && binding.mode === 'HUMAN') {
      if (!binding.handoffE164) {
        this.logger.warn(
          {
            event: 'voice.inbound.human_handoff_misconfigured',
            organizationId: org.id,
            callerNumberId: number.id,
            callSid: context.providerCallSid,
          },
          'HUMAN inbound mode but handoff_e164 is empty; failing closed.',
        );
        await this.persistSession(context, org.id, number.id, 'human_misconfigured');
        return {
          action: 'reject',
          reason: 'misconfigured',
          prompt: 'This line is misconfigured. Please contact support.',
          voice: 'female',
        };
      }
      this.logger.log(
        {
          event: 'voice.inbound.human_handoff',
          organizationId: org.id,
          callerNumberId: number.id,
          handoff: maskPhone(binding.handoffE164),
          callSid: context.providerCallSid,
        },
        'Inbound call transferring to a human.',
      );
      await this.persistSession(context, org.id, number.id, null);
      return {
        action: 'transfer_to_human',
        prompt: `Connecting you to a member of the ${org.name} team.`,
        voice: 'female',
        handoffE164: binding.handoffE164,
        callerId: number.phoneE164,
        ringTimeoutSeconds: 30,
      };
    }

    // AI mode (explicit binding.mode='AI' OR no binding + Sarvam available): run the turn loop.
    if (this.ai.isAvailable() && context.providerCallSid) {
      this.logger.log(
        {
          event: 'voice.inbound.ai_turn_opening',
          organizationId: org.id,
          callerNumberId: number.id,
          hasBinding: binding !== undefined,
          from: maskPhone(context.fromE164),
          to: maskPhone(context.toE164),
          callSid: context.providerCallSid,
        },
        'Inbound call entering turn-based AI conversation.',
      );
      await this.persistSession(context, org.id, number.id, null);
      return this.ai.openingDecision({
        callSid: context.providerCallSid,
        organizationName: org.name,
      });
    }

    if (binding && binding.mode === 'AI') {
      // Explicit AI mode but no AI backend wired: fail-closed rather than silently fall through.
      this.logger.warn(
        {
          event: 'voice.inbound.ai_leg_not_available',
          organizationId: org.id,
          callerNumberId: number.id,
          callSid: context.providerCallSid,
        },
        'Inbound binding set to AI but SARVAM_API_KEY is not configured.',
      );
      await this.persistSession(context, org.id, number.id, 'ai_not_available');
      return {
        action: 'reject',
        reason: 'ai_not_available',
        prompt: AI_UNAVAILABLE_PROMPT,
        voice: 'female',
      };
    }

    this.logger.log(
      {
        event: 'voice.inbound.accepted',
        organizationId: org.id,
        callerNumberId: number.id,
        from: maskPhone(context.fromE164),
        to: maskPhone(context.toE164),
        callSid: context.providerCallSid,
      },
      'Inbound call resolved to organization greeting.',
    );
    await this.persistSession(context, org.id, number.id, null);
    return {
      action: 'say_and_hangup',
      prompt: defaultWelcome(org.name),
      voice: 'female',
    };
  }

  async handleStatus(context: StatusCallbackContext): Promise<void> {
    if (!context.providerCallSid) {
      this.logger.debug(
        { event: 'voice.status.no_sid' },
        'Status callback without a CallSid; nothing to reconcile.',
      );
      return;
    }
    await this.db
      .update(callSessions)
      .set({
        endedAt: context.receivedAt,
        durationSeconds: context.durationSeconds ?? 0,
        telephonyOutcome: context.callStatus,
      })
      .where(
        and(
          eq(callSessions.provider, context.provider),
          eq(callSessions.providerCallId, context.providerCallSid),
        ),
      );
    this.logger.log(
      {
        event: 'voice.status.recorded',
        callSid: context.providerCallSid,
        status: context.callStatus,
        duration: context.durationSeconds,
      },
      'Call status recorded.',
    );
  }

  /**
   * Writes one `call_sessions` row for the inbound call, idempotent on `(provider, call_sid)`
   * so Exotel retries don't duplicate the record. `rejectReason` is folded into
   * `telephonyOutcome` so operators can filter rejected inbound calls in the dashboard without
   * a separate column.
   */
  private async persistSession(
    context: InboundCallContext,
    organizationId: string,
    callerNumberId: string,
    rejectReason: string | null,
  ): Promise<void> {
    if (!context.providerCallSid) {
      // Without a stable call id we cannot deduplicate: skip the write rather than create
      // orphan rows that compete with the real session when the status callback arrives.
      return;
    }
    try {
      await this.db
        .insert(callSessions)
        .values({
          organizationId,
          direction: 'INBOUND',
          callerNumberId,
          fromE164: context.fromE164,
          toE164: context.toE164,
          provider: context.provider,
          providerCallId: context.providerCallSid,
          startedAt: context.receivedAt,
          telephonyOutcome: rejectReason,
        })
        .onConflictDoNothing({ target: [callSessions.provider, callSessions.providerCallId] });
    } catch (error) {
      // Belt-and-braces: never fail the webhook response because the persist step failed. We
      // still return 200 so Exotel doesn't retry; the error is captured for alerting.
      this.logger.error(
        {
          event: 'voice.inbound.persist_failed',
          error: error instanceof Error ? error.message : String(error),
          callSid: context.providerCallSid,
        },
        'Failed to persist call_sessions row for inbound call.',
      );
    }
  }

  /** Clock surface used by the controller for consistent timestamps. */
  now(): Date {
    return this.clock.now();
  }
}
