/**
 * Provider-agnostic decision for an inbound call. The webhook controller translates whatever the
 * telephony provider sent into an `InboundCallContext`, the `InboundCallService` resolves it to
 * an `InboundDecision`, and the provider-specific renderer serializes that decision into the
 * provider's response format (ExoML for Exotel, TwiML for Twilio, …).
 *
 * Keeping the decision provider-agnostic is what makes the `VoiceProvider` interface (ADR-011)
 * payable in practice: changing providers means swapping a parser and a renderer, not rewriting
 * the policy that answers the phone.
 */

export interface InboundCallContext {
  readonly provider: 'exotel';
  readonly providerCallSid: string | null;
  readonly fromE164: string;
  readonly toE164: string;
  readonly receivedAt: Date;
  readonly direction: 'inbound';
}

export type ExoVoice = 'female' | 'male';

/** Terminal: play a greeting and hang up. Used when there is no AI leg to run. */
export interface SayAndHangupDecision {
  readonly action: 'say_and_hangup';
  readonly prompt: string;
  /** Exotel's `<Say voice>` value; validated at the renderer. */
  readonly voice: ExoVoice;
}

/** Reject the call with a message. Used for unknown numbers, suspended orgs, breaker trips. */
export interface RejectDecision {
  readonly action: 'reject';
  readonly reason:
    | 'unknown_number'
    | 'organization_blocked'
    | 'ai_not_available'
    | 'misconfigured';
  readonly prompt: string;
  readonly voice: ExoVoice;
}

/**
 * One turn of a conversational AI call (ADR-024, turn-based mode): speak a line, then record the
 * caller's reply and POST it to `continueActionUrl`. The caller silence timeout and max record
 * length are decided here (not at the renderer) so the service can tune them per turn — short
 * first prompt, longer for substantive answers, etc.
 */
export interface AiTurnDecision {
  readonly action: 'ai_turn';
  readonly prompt: string;
  readonly voice: ExoVoice;
  /** Full absolute URL Exotel will POST the recording to; includes `callSid` + `turn` params. */
  readonly continueActionUrl: string;
  /** How many seconds of silence end the recording. 2 s is a comfortable turn boundary. */
  readonly finishOnSilenceSeconds: number;
  /** Cap each utterance so a hung line can't record forever. */
  readonly maxRecordSeconds: number;
}

/** Terminal: speak a farewell and hang up. Reached by max turns, explicit end intent, or error. */
export interface AiEndDecision {
  readonly action: 'ai_end';
  readonly prompt: string;
  readonly voice: ExoVoice;
}

/**
 * Terminal (human handoff mode): speak a short announcement, then `<Dial>` the caller through to a
 * live person at `handoffE164`. ExoML `<Dial>` waits for the human leg to end, then returns to the
 * Flow for a `<Hangup/>`. The caller's phone is held open throughout.
 */
export interface TransferToHumanDecision {
  readonly action: 'transfer_to_human';
  /** Short line spoken before the connect ring; keep ≤ 1 sentence. */
  readonly prompt: string;
  readonly voice: ExoVoice;
  /** E.164 destination; validated to look like an Indian number by the service. */
  readonly handoffE164: string;
  /**
   * The ExoPhone shown to the dialled party (and billed by Exotel). Must be a verified ExoPhone
   * of the account — Exotel rejects `<Dial>` with an empty or unverified callerId. We pass the
   * inbound caller_number that answered this call, since it is guaranteed to be an ExoPhone.
   */
  readonly callerId: string;
  /** Seconds we'll wait for the human to answer before giving up. 30 is Exotel's default. */
  readonly ringTimeoutSeconds: number;
}

export type InboundDecision =
  | SayAndHangupDecision
  | RejectDecision
  | AiTurnDecision
  | AiEndDecision
  | TransferToHumanDecision;

/** Terminal status Exotel pushes once the call ends. */
export interface StatusCallbackContext {
  readonly provider: 'exotel';
  readonly providerCallSid: string | null;
  readonly fromE164: string | null;
  readonly toE164: string | null;
  readonly callStatus: string | null;
  readonly durationSeconds: number | null;
  readonly direction: 'inbound' | 'outbound' | null;
  readonly receivedAt: Date;
}

/** POST payload for the turn-continuation webhook. The parser normalizes Exotel's field names. */
export interface TurnCallbackContext {
  readonly provider: 'exotel';
  readonly providerCallSid: string;
  /** 0-indexed turn number — the greeting is turn 0, the first caller utterance arrives on turn 1. */
  readonly turnIndex: number;
  /** URL to fetch the recorded WAV from. */
  readonly recordingUrl: string | null;
  /** Length of the recording in seconds, as reported by Exotel. */
  readonly recordingDurationSeconds: number | null;
  readonly receivedAt: Date;
}
