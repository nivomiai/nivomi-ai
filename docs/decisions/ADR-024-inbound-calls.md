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
