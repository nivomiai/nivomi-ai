# ADR-023: Live voice session — STT/TTS seams and the voice session runner

- **Status:** Accepted
- **Date:** 2026-10-04
- **Builds on:** ADR-011 (voice pipeline, Exotel/Sarvam/LLMRouter), ADR-021 (eligibility
  decisions, obligations), ADR-022 (AI Agents, conversation engine)

## Context

ADR-022 built the agent layer and the conversation engine, both exercised in the browser **test
chat**. Phase 4b carries the same engine into **real phone calls**: audio streams in and out of
telephony, with partial transcripts and streamed speech. We cannot open the Exotel or Sarvam
accounts until the owner's hold lifts (`docs/planning/status-holds-and-next.md`), so we must land
the design, the seams and the fakes now, so turning the real services on later is adapter work.

## Decision

### 1. Two new provider seams

Business logic depends on interfaces; the Sarvam adapter replaces the simulated one once
credentials land.

| Seam          | Shape                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `STTProvider` | `openStream({languageHint})` → `SttStream` with `push`/`end`/`cancel` and an async-iterable of partials and a final transcript |
| `TTSProvider` | `speak({text, language, voice, agentVersionId})` → `TtsStream` of PCM chunks, cancellable on barge-in                          |

Both are **streaming** by contract (ADR-011 §Streaming pipeline). Each is initialised from
`ApiEnv` and refused in production unless the real adapter is configured (ADR-006 fail-fast).

### 2. The voice session runner

`VoiceSessionRunner` (`apps/api/src/voice/voice-session-runner.ts`) owns one call: it opens the
STT stream per caller turn, hands the final transcript to the stateless `ConversationEngine`, and
streams the engine's reply through TTS back onto the call. It is **transport-agnostic**: in
production the voice worker (Exotel adapter) feeds RTP frames into `pushAudio` and consumes
`agentAudio`; in tests `SimulatedSTTProvider` and `SimulatedTTSProvider` round-trip text through
the same code path.

Lifecycle:

1. **start** — refuses to start when the current compliance decision needs a recording notice
   the agent isn't configured to speak (last-line defence against a drifted Agent Version; the
   eligibility engine's pre-launch pass is the primary enforcement). The engine's
   `openingLines()` speaks the AI disclosure and recording notice itself; the runner never
   duplicates them.
2. **pushAudio** — forwards into the current STT stream; silently drops after close.
3. **endCallerTurn** — ends the STT stream, awaits the final transcript, hands it to
   `engine.reply(state, text, history)`, and plays the engine's utterances through TTS. Empty
   transcripts count as silence; `silenceTurnsBeforeHangup` consecutive empty turns auto-close
   the call.
4. **close(reason)** — cancels any in-flight TTS and STT streams, drains the audio queue, returns
   `{outcome, conversationOutcome, transcript, usage}`.

### 3. CallOutcome mapping

The engine's `ConversationOutcome` is richer than the telephony `CallOutcome` enum:

| ConversationOutcome                                                | CallOutcome (now) | Note                                                                                                  |
| ------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------- |
| OPTED_OUT                                                          | OPTED_OUT         | Triggers suppression + consent revocation in CallOutcomeService                                       |
| NOT_INTERESTED                                                     | NOT_INTERESTED    | —                                                                                                     |
| INTERESTED, CALLBACK_REQUESTED, COMPLETED, TRANSFERRED, INCOMPLETE | CONNECTED         | Dialled and reached a human; richer outcome persisted on the planned `call_transcripts` row (Phase 5) |

Any `close(reason: 'provider_failure')` returns `PROVIDER_ERROR`, regardless of engine state.

### 4. Barge-in

The runner tracks the current TTS stream. Phase 4b's barge-in detector (RMS / RFC 2833 /
Sarvam voice activity, chosen with the Exotel adapter) will call a new `interrupt()` that cancels
the current `TtsStream`, re-opens an STT stream and advances to a caller turn immediately. The
`TtsStream.cancel()` contract is already in place; `interrupt()` is deferred to the Exotel
adapter PR.

### 5. Metering

Every STT final event carries `audioSeconds`; every TTS request names the agent version so
Phase 8 can meter minutes and audio seconds per tenant. The engine already returns LLM
`inputTokens`/`outputTokens`; the runner sums them across turns.

### 6. Preference registry

ADR-021 §5 kept the preference registry as a seam (`PreferenceRegistry`, with
`SimulatedPreferenceRegistry` behind it). Phase 4b leaves the seam as-is: the NCPR / DND adapter
lands with the Exotel account because NCPR access often comes through the telephony partner
(VQ-8). "Unavailable → DEFERRED" stays the fail-closed default.

## Consequences

- Live voice work can proceed against fakes end to end: `VoiceSessionRunner` + `SimulatedSTTProvider`
  - `SimulatedTTSProvider` + `SimulatedLLMProvider` run a scripted call in a unit test.
- The runner is where every per-call quality concern lands: silence/hangup detection,
  barge-in, usage accounting, and the final CallOutcome mapping.
- `TECH_DEBT`:
  - **Call-outcome granularity** — `call_outcome` enum doesn't carry INTERESTED /
    CALLBACK_REQUESTED. Phase 5 adds a `call_transcripts` table that stores the richer
    `conversationOutcome` and the transcript itself.
  - **Barge-in interrupt** — `VoiceSession.interrupt()` is not implemented; Exotel adapter PR.
  - **Real STT/TTS adapters** — `SarvamSTTProvider`, `SarvamTTSProvider` are not written. The
    LLM adapter choice (Claude, GPT, open-source) is still open (`docs/planning/status-holds-and-next.md`).

## Alternatives considered

- **Engine owns the call lifecycle.** Rejected: the engine stays stateless and testable in the
  browser; the runner is the only piece that holds live-call state (STT stream handles, TTS
  cancellation tokens, silence counters). The browser test chat and the voice worker share the
  same engine; only the runner changes.
- **Non-streaming TTS.** Rejected: ADR-011's latency target (< 1.5–2 s) requires streaming
  first audio while generation continues; the interface forces every adapter to support it.
- **Store the opening lines on the compliance decision.** Rejected: the opening is agent-shaped
  (persona name, company, purpose), the obligations are policy-shaped. Keep policy in the
  decision; keep wording in the agent (prompt-compiler `openingLines`).
