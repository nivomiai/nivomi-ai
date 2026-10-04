import type { CallOutcome } from '@nivomi/database';
import { createHash, randomUUID } from 'node:crypto';
import type { ComplianceObligations } from '../compliance/compliance-engine.js';
import type { JobQueue } from '../jobs/jobs.js';

/**
 * Outbound calling (ADR-011, ADR-021). Business logic depends on this interface; the Exotel
 * adapter replaces the simulated one in Phase 4.
 */
export interface PlaceCallRequest {
  /** Nivomi's call attempt id; the provider echoes it back and can be searched by it. */
  readonly reference: string;
  readonly organizationId: string;
  readonly from: string;
  readonly to: string;
  /** What the call must say up front (AI disclosure, recording notice; CR-10). */
  readonly obligations: ComplianceObligations | null;
  /** The Agent Version that speaks on this call (FR-32). */
  readonly agentVersionId: string | null;
}

export interface VoiceProvider {
  readonly name: string;
  /** Asks the provider to dial. Throws {@link VoiceProviderError} when it refuses or fails. */
  placeCall(request: PlaceCallRequest): Promise<{ providerCallId: string }>;
  /** Finds a call by `reference`, for reconciling after a crash (never dials). */
  findCall(reference: string): Promise<{ providerCallId: string } | null>;
  /** Ends a live call gracefully (Emergency Stop). */
  endCall(providerCallId: string): Promise<void>;
}

export const VOICE_PROVIDER = Symbol('VOICE_PROVIDER');

export class VoiceProviderError extends Error {
  override readonly name = 'VoiceProviderError';
}

/** Job type through which the simulated dialer reports a finished call, like a callback. */
export const SIMULATED_CALL_EVENT = 'voice.simulated_call_event';

export interface SimulatedCallEvent extends Record<string, unknown> {
  readonly attemptId: string;
  readonly providerCallId: string;
  readonly outcome: CallOutcome;
  readonly durationSeconds: number;
}

/** Deterministic outcome for the n-th simulated call to a number. */
export function simulatedOutcome(
  to: string,
  n: number,
): { outcome: CallOutcome; durationSeconds: number } {
  const hash = createHash('sha256').update(`${to}:${n}`).digest();
  const roll = (hash[0] ?? 0) % 100;
  const seconds = 30 + ((hash[1] ?? 0) % 180);
  if (roll < 55) return { outcome: 'CONNECTED', durationSeconds: seconds };
  if (roll < 75) return { outcome: 'NO_ANSWER', durationSeconds: 0 };
  if (roll < 85) return { outcome: 'BUSY', durationSeconds: 0 };
  if (roll < 90) return { outcome: 'FAILED', durationSeconds: 0 };
  if (roll < 97) return { outcome: 'NOT_INTERESTED', durationSeconds: Math.min(seconds, 60) };
  return { outcome: 'WRONG_NUMBER', durationSeconds: 15 };
}

/**
 * Development and test dialer: no telephony, outcomes delivered asynchronously through the job
 * queue after `callMs`. Deterministic per number unless a test scripts outcomes. Refused in
 * production (env validation).
 */
export class SimulatedVoiceProvider implements VoiceProvider {
  readonly name = 'simulated';
  /** Outcomes to return, in order, for calls to a number (tests). */
  readonly script = new Map<string, { outcome: CallOutcome; durationSeconds: number }[]>();
  /** The next N `placeCall` requests fail (provider-failure tests). */
  failNext = 0;
  readonly placed: PlaceCallRequest[] = [];
  /** While true, calls stay live: their outcome events wait in `held` until released (tests). */
  holdCalls = false;
  readonly held: SimulatedCallEvent[] = [];
  private readonly calls = new Map<string, string>();
  private readonly perNumber = new Map<string, number>();

  constructor(
    private readonly queue: JobQueue,
    private readonly callMs: number,
  ) {}

  async placeCall(request: PlaceCallRequest): Promise<{ providerCallId: string }> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new VoiceProviderError('Simulated provider failure');
    }
    this.placed.push(request);
    const providerCallId = `sim-${randomUUID()}`;
    this.calls.set(request.reference, providerCallId);
    const n = (this.perNumber.get(request.to) ?? 0) + 1;
    this.perNumber.set(request.to, n);
    const planned = this.script.get(request.to)?.shift() ?? simulatedOutcome(request.to, n);
    const event: SimulatedCallEvent = {
      attemptId: request.reference,
      providerCallId,
      outcome: planned.outcome,
      durationSeconds: planned.durationSeconds,
    };
    if (this.holdCalls) this.held.push(event);
    else await this.deliver(event, this.callMs);
    return { providerCallId };
  }

  /** Lets held calls finish now. */
  async releaseCalls(): Promise<void> {
    for (const event of this.held.splice(0)) await this.deliver(event, 0);
  }

  private async deliver(event: SimulatedCallEvent, afterMs: number): Promise<void> {
    await this.queue.enqueue({
      type: SIMULATED_CALL_EVENT,
      payload: event,
      runAt: new Date(Date.now() + afterMs),
      idempotencyKey: `sim-call:${event.providerCallId}`,
    });
  }

  findCall(reference: string): Promise<{ providerCallId: string } | null> {
    const providerCallId = this.calls.get(reference);
    return Promise.resolve(providerCallId ? { providerCallId } : null);
  }

  /** Ends at once; the attempt closes as FAILED (retryable if the campaign resumes). */
  async endCall(providerCallId: string): Promise<void> {
    const attemptId = [...this.calls].find(([, id]) => id === providerCallId)?.[0];
    if (!attemptId) return;
    await this.queue.enqueue({
      type: SIMULATED_CALL_EVENT,
      payload: {
        attemptId,
        providerCallId,
        outcome: 'FAILED',
        durationSeconds: 0,
      } satisfies SimulatedCallEvent,
      idempotencyKey: `sim-call-end:${providerCallId}`,
    });
  }
}
