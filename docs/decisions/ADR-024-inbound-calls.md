# ADR-024: Inbound calls — routing, in-queue AI handling and call transcripts

- **Status:** Accepted
- **Date:** 2026-10-04
- **Builds on:** ADR-011 (telephony seam), ADR-021 (eligibility and obligations), ADR-022
  (AI Agents), ADR-023 (voice session runner)

## Context

PRD revision 2 made inbound calls and human escalation MVP capabilities. A caller dials one of
the tenant's Exotel numbers. We must decide which Agent Version answers, how we meet CR-10
(disclosure, recording notice) on inbound, how we hand off to a human, and what we persist about
the call.

## Decision

### 1. Inbound routing table

Per `caller_numbers.id`, tenants bind one Agent Version (`inbound_agent_version_id`) and an
inbound business-hours policy (reuse the campaign window shape, kept on the agent). An unbound
number plays a static "we can't take your call right now" prompt and hangs up — never silently
dropped.

### 2. Inbound uses the same session runner

The Phase 4b `VoiceSessionRunner` is reused unchanged: the Exotel adapter opens an inbound call,
creates the runner with the bound agent, and the engine's `openingLines()` speaks the AI
disclosure and recording notice. Outbound-only concerns (eligibility decision, retry) do not
apply. CR-10 obligations are read from the rule set directly (both `aiDisclosureRequired` and
`recordingNoticeRequired` must be true for every tenant anyway in India v1).

### 3. Handoff

A new `AgentHandoffService` resolves the agent's `escalation.target` to a real destination
(an organization-owned handoff queue; for Phase 5 this is a single on-call phone number held on
the Agent Version). `VoiceProvider.transferCall(providerCallId, toE164, {warm?: boolean})` is
added to the seam; the simulated provider logs it and the adapter wires Exotel's transfer API.

### 4. New table: `call_sessions`

Replaces the Phase 4b "in-memory only" transcript. One row per call, inbound or outbound,
tenant-owned:

- `id`, `organization_id`, `direction` ('INBOUND' | 'OUTBOUND')
- `caller_number_id` (nullable for outbound-only setups), `from_e164`, `to_e164`
- `agent_version_id`
- `call_attempt_id` (nullable; set only for outbound; FK to `call_attempts`)
- `provider_call_id`
- `started_at`, `ended_at`, `duration_seconds`
- `conversation_outcome` (`CONVERSATION_OUTCOME` enum: INTERESTED, NOT_INTERESTED,
  CALLBACK_REQUESTED, COMPLETED, OPTED_OUT, TRANSFERRED, INCOMPLETE)
- `telephony_outcome` (`call_outcome` existing enum)
- `transcript_jsonb` — ordered list of `{role, text, nodeId?, atMs}` entries
- `qualification_jsonb` — the engine's final `QualificationResult`
- `usage_jsonb` — `{inputTokens, outputTokens, audioSeconds}` for Phase 8 metering

Indexes: `(organization_id, started_at desc)`, `(organization_id, direction, telephony_outcome)`.
Retention: 2 years (reuse the retention matrix from ADR-021).

### 5. Opt-out from inbound

An opt-out intent in an inbound call still writes to the suppression list and the consent ledger
(`IN_CALL_OPT_OUT`), identical to outbound. No separate code path.

### 6. Permission + API

- Permission `calls.read` (OWNER, ADMIN, MANAGER, ANALYST).
- `GET /api/v1/calls` — paginated list, filter by direction, outcome, agent version, number,
  date range.
- `GET /api/v1/calls/:id` — one call with its transcript.
- `GET /api/v1/caller-numbers/:id/inbound-config` and `PUT …` — bind the Agent Version and the
  handoff target (`telecom.manage`).

## Consequences

- The runner's `VoiceSessionResult` already carries `conversationOutcome` + `transcript` + `usage`;
  the campaign runner (outbound) and the Exotel inbound adapter (inbound) both persist them to
  `call_sessions` on `close`.
- Phase 4b's TECH_DEBT on call-outcome granularity and transcript persistence closes here.
- Deferred: dynamic handoff routing (round-robin, overflow, voicemail), call tagging, redaction
  in transcripts (Phase 10 observability picks up PII redaction).

## Implementation status (2026-10-10)

First production slice is live on Exotel's free plan. What runs today:

- `POST|GET /api/v1/webhooks/exotel/inbound` and `/status` — `VoiceWebhookController` →
  `InboundCallService`. Signature-verified by `ExotelWebhookGuard` (HMAC-SHA256 of the raw body
  or query string; strict in production, verify-when-secret-set otherwise).
- `InboundCallService` resolves `To` → `caller_numbers` → `organizations`, blocks suspended/
  closed orgs, persists one `call_sessions` row (idempotent on `(provider, provider_call_id)`),
  and returns a provider-agnostic `InboundDecision` that the ExoML renderer serializes.
- Super-admin control plane: `GET|POST|DELETE /api/v1/platform/voice-numbers`
  (`PlatformVoiceNumbersService`). Numbers are stored as `caller_numbers` rows with
  `series = 'INBOUND'` and `purpose = 'SERVICE'`; both actions are audited
  (`platform.voice_number_registered`, `platform.voice_number_released`).
- Decision modes shipped: `say_and_hangup`, `reject`, `ai_turn` and `ai_end` (new, see below).

### Turn-based AI loop (free-plan alternative to streaming)

Exotel `<Connect><Stream>` requires a paid add-on. Rather than defer AI calls until that lands,
the first slice ships a **turn-based** conversation on primitives the free plan already supports:

```
Caller dials ExoPhone
  └─ /webhooks/exotel/inbound        → ai_turn: <Say>greeting</Say><Record action=…/>
       Caller speaks (≤20 s, 2 s silence ends it)
       └─ Exotel POSTs RecordingUrl to
          /webhooks/exotel/inbound/turn?callSid=…&turn=N
            └─ AiConversationService
                 fetch(RecordingUrl, basic auth: EXOTEL_API_KEY:EXOTEL_API_TOKEN)
                 Sarvam STT          (saaras:v4)
                 Sarvam chat         (SARVAM_CHAT_MODEL; keeps a 16-turn context window)
                 append {caller, agent} to call_sessions.transcript
                 update call_sessions.usage {inputTokens, outputTokens, audioSeconds}
                 → ai_turn (next <Say>+<Record>)  or  ai_end (<Say>+<Hangup/>)
  └─ /webhooks/exotel/status         → endedAt + durationSeconds + telephonyOutcome
```

- Opening prompt is a generic "Hi, this is the {org.name} AI assistant" + "how can I help".
  Per-tenant agent definitions (ADR-024 §2) are not yet threaded in — the opener and system
  prompt live in `AiConversationService` for this slice.
- End conditions: `MAX_TURNS = 10`, `MAX_CONSECUTIVE_SILENT_TURNS = 2` (STT returned empty text
  twice in a row), or an LLM failure. Each ends with a short spoken farewell + `<Hangup/>`.
- Idempotency: a replayed turn webhook (same `CallSid` + `turn`) returns the stored agent reply
  rather than running STT/LLM a second time.
- Expected latency per turn: ~2–4 s (fetch recording + STT + LLM). Audible but acceptable for
  the free-plan ceiling.
- TTS is Exotel's `<Say>` (Polly). This limits richer Indic voices; swapping to Sarvam TTS via
  `<Play url>` is a follow-up (needs an audio-hosting endpoint + signed-token store).

### Trigger

The AI loop runs when `SARVAM_API_KEY` is configured and the organization is `ACTIVE`. A
registered ExoPhone with no `inbound_bindings` row still enters the AI loop with the generic
prompt. A binding present without a Sarvam key fails closed with `ai_not_available`.

### Env additions

- `API_PUBLIC_URL` — public base URL this API answers on, used to build the `<Record action>`
  callback. Required in production, defaults to `http://localhost:${PORT}` otherwise. Point this
  at an ngrok tunnel while testing locally against the real Exotel sandbox.
- `SARVAM_API_KEY`, `SARVAM_CHAT_MODEL` — already present; now consumed by the inbound path as
  well as the public /demo/voice page.
- `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN` — already present; the service now also uses them as
  HTTP Basic credentials to download `RecordingUrl` from Exotel.

### What streaming (ADR-023) replaces when it lands

- The `<Say>+<Record>` loop is replaced with `<Connect><Stream>` to a WebSocket on this API.
- `AiConversationService` becomes the single-call runner's turn controller, delegating STT/TTS
  to the streaming `STTProvider` / `TTSProvider` adapters (so first-token latency drops from
  ~2–4 s to ~1 s).
- The transcript/usage persistence and end-of-call status handling stay identical.

Not yet built from the original §1–§6 above (follow-up stories):

- `inbound_bindings` row creation UI (`/app/telecom/numbers/:id/inbound-config`) — DB schema
  exists; today an operator must INSERT directly to pin an Agent Version. The AI loop runs
  without a binding by using a generic prompt.
- Per-tenant agent definitions threading into `AiConversationService.buildMessages` — Phase 4a
  defines the agent graph; this slice uses a hard-coded conversational system prompt.
- `AgentHandoffService` and `VoiceProvider.transferCall` — paired with the streaming work.
- `/api/v1/calls/:id` detail endpoint — exists (ADR-024 §6) and returns the transcript; web
  detail page lives at `/app/calls/[id]`.
- IVR fallback mode (`<Gather>`) if we decide to offer a scripted alternative to AI.
- Per-number welcome-prompt override.
- Sarvam TTS via `<Play url>` instead of Polly `<Say>`, with the signed audio-asset endpoint.
