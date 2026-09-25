# ADR-011: Voice pipeline providers: Exotel, Sarvam, LLMRouter

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

The MVP's core loop is a live AI phone conversation in Indian languages (English, Hindi,
Malayalam, Tamil, Telugu, Kannada). It needs telephony, streaming speech recognition and
synthesis, and an LLM, with low perceived latency and no lock-in to any single vendor.

## Decision

| Concern   | Initial provider     | Abstraction                         |
| --------- | -------------------- | ----------------------------------- |
| Telephony | Exotel               | `VoiceProvider`                     |
| STT       | Sarvam               | `STTProvider` (streaming)           |
| TTS       | Sarvam               | `TTSProvider` (streaming)           |
| LLM       | Chosen by evaluation | `LLMProvider` behind an `LLMRouter` |

- **Telephony isolation:** number provisioning, ownership, routing, caller ID, call control,
  recordings and number lifecycle live entirely in the Exotel adapter. Domain code speaks in
  Nivomi concepts (call, number, transfer), never Exotel identifiers or payloads.
- **Streaming pipeline:** audio streams from telephony into streaming STT; partial transcripts
  drive the agent; LLM output streams into streaming TTS; audio streams back to the call.
- **Barge-in:** when the caller starts speaking, TTS playback and in-flight generation are
  cancelled and the turn is re-planned.
- **Fallback:** each provider interface supports ordered fallbacks, configured per organization
  or platform-wide in Super Admin, with health checks and circuit breaking.
- **LLMRouter** selects a model per task (live turn vs. post-call summary) from configuration.
  The default model is chosen by an evaluation on Indic-language sales conversations measuring
  accuracy, latency, cost, reliability and availability.
- **Latency target:** under 1.5–2 s perceived turn latency where achievable. It is an engineering
  target, not an SLA. Each stage (STT final, LLM first token, TTS first audio) is measured per turn.

## Consequences

- The voice runtime is stateful per call and runs as its own worker service (ADR-010), not inside
  the HTTP API.
- Business state (call outcome, customer status, transcript) is written to Nivomi's database;
  it never depends solely on provider records.
- Every provider call is metered for usage and cost (minutes, audio seconds, tokens).
- Exotel and Sarvam integration details (streaming protocol, audio formats, webhooks, limits,
  pricing) must come from their current official documentation before implementation.
