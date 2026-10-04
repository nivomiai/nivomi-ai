---
title: 'Phase 4b: Live voice — STT/TTS seams, voice session runner, Exotel adapter'
type: 'feature'
created: '2026-10-04'
status: 'in-progress'
route: 'build'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/decisions/ADR-023-live-voice-session.md'
  - '{project-root}/docs/decisions/ADR-022-ai-agents-and-conversation-workflows.md'
  - '{project-root}/docs/decisions/ADR-011-voice-pipeline-providers.md'
  - '{project-root}/docs/decisions/ADR-021-compliance-rule-data-and-eligibility-decisions.md'
---

## Intent

**Problem.** Phase 4a built the AI Agent and the conversation engine, both exercised in **test
chat**. Phase 3 built campaigns, eligibility, obligations and a `SimulatedVoiceProvider`. Phase
4b carries the same conversation engine onto **real phone calls**: streaming speech in and out,
compliant opening, barge-in, call outcome persistence.

**Approach.**

1. Add two provider seams — `STTProvider` and `TTSProvider` — with simulated adapters. Streaming
   contract per ADR-011; `cancel()` for barge-in.
2. Add `VoiceSessionRunner` — a transport-agnostic driver that pumps STT into the engine and the
   engine's replies into TTS. The runner refuses to start when the compliance decision requires a
   recording notice the Agent Version isn't configured to speak.
3. Wire the runner into the campaign-runner so a `DIALING` attempt starts a session (behind the
   `SimulatedVoiceProvider` until the Exotel adapter lands).
4. Replace `SimulatedVoiceProvider` with `ExotelVoiceProvider` (adapter PR) and
   `SimulatedSTTProvider`/`SimulatedTTSProvider` with Sarvam adapters (adapter PR). Both are
   deferred until the Exotel / Sarvam accounts are open (ADR-011; status file).
5. Preference registry stays a seam (ADR-021 §5); NCPR / DND adapter lands with Exotel because
   NCPR access often comes through the telephony partner (VQ-8).

Out of scope here (later phases): persisting the per-call transcript to a new `call_transcripts`
table and extending `call_outcome` to carry INTERESTED / CALLBACK_REQUESTED — moved to **Phase
5** (inbound) because that phase already needs the transcript row.

## Significant-feature questions (CLAUDE.md)

| Question                 | Answer                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data owner and tenant    | A live call reads tenant data (Agent Version pinned by the campaign, compliance decision for the attempt) and writes to tenant-owned `call_attempts`. No new tables in this phase.                 |
| Source of truth          | The `call_attempts` row (Phase 3) is the authoritative call record. The transcript and the richer `conversationOutcome` live only in memory for 4b; Phase 5 persists them.                        |
| Authorization and audit  | No new permissions. Emergency Stop (`campaigns.emergency_stop`) still ends live calls through `VoiceProvider.endCall`; the runner's `close('emergency_stop')` is driven by the campaign runner.    |
| Provider failure         | STT or TTS failure during a call closes the session with `PROVIDER_ERROR`, feeding `CallOutcomeService.apply`. The engine never regresses: a provider failure for one call never breaks another.  |
| Duplicate delivery       | The runner is per-call: only one STT stream is open at any time; `endCallerTurn` is idempotent after the first call (returns without advancing). Provider status callbacks remain idempotent on providerCallId. |
| Worker crash / DB outage | A crashed worker leaves the attempt `DIALING`; reconciliation (ADR-021 §5) finds the provider's status via `VoiceProvider.findCall`. The transcript is lost for 4b; this is acceptable (not yet audited) and fixed in Phase 5. |
| Usage and cost           | The STT final event carries `audioSeconds`; TTS requests name the agent version. The runner sums LLM tokens across turns and returns them in `VoiceSessionResult.usage` for Phase 8 metering.      |
| 100× scale               | Each live call is one worker process holding one STT stream + one TTS stream + one engine state (tens of KB). The campaign-runner's concurrency cap applies.                                      |

## Acceptance (this slice)

- `STTProvider`, `TTSProvider` interfaces with streaming contracts and `SimulatedSTTProvider` /
  `SimulatedTTSProvider` fakes.
- `VoiceSessionRunner`:
  - speaks the opener via the engine (AI disclosure + recording notice);
  - refuses to start when compliance requires a recording notice but the agent is not configured
    to speak one;
  - round-trips caller text through STT → engine → TTS;
  - maps conversation outcomes to `CallOutcome` (NOT_INTERESTED, OPTED_OUT; otherwise CONNECTED);
  - returns `PROVIDER_ERROR` on `close('provider_failure')`;
  - auto-hangs-up after `silenceTurnsBeforeHangup` consecutive silent turns;
  - sums LLM tokens across turns into `usage`.
- Unit tests cover the above (`apps/api/src/voice/voice-session-runner.test.ts`).
- Env config: STT and TTS providers selectable from `ApiEnv`, simulated by default, refused in
  production unless the real adapter is configured.
- ADR-023 recorded.

## Deferred to adapter PRs (unblocked when accounts are open)

- `ExotelVoiceProvider` — number provisioning, routing, caller ID, call control, status
  callbacks, recordings, `findCall(reference)` for reconciliation.
- `SarvamSTTProvider` / `SarvamTTSProvider` — streaming audio to and from the vendor; language
  routing (en, hi, ml, ta, te, kn); voice choice from the agent definition.
- LLM adapter — the vendor is still open (status file). Default model chosen by evaluation
  (ADR-011).
- Barge-in: a `VoiceSession.interrupt()` entry point that cancels current TTS, re-opens STT and
  advances to a caller turn. The `TtsStream.cancel()` contract is already in place.
- NCPR / DND `PreferenceRegistry` real adapter (VQ-8).

## Verification plan

- `npm run test:unit -w @nivomi/api` — voice session unit tests green.
- `npm run verify` — full gate.
- Manual: once the campaign-runner wires through, dial a seed lead in the local dev app and
  watch the simulated transcript print in the API logs (deferred until the campaign-runner wiring
  lands in a follow-up PR; the pre-wiring work in this story is the runner + fakes themselves).
