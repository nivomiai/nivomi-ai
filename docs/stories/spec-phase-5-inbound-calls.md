---
title: 'Phase 5: Inbound calls, call sessions and the transcript store'
type: 'feature'
created: '2026-10-04'
status: 'proposed'
route: 'build'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/decisions/ADR-024-inbound-calls.md'
  - '{project-root}/docs/decisions/ADR-023-live-voice-session.md'
---

## Intent

**Problem.** PRD revision 2 made inbound calls MVP. Phase 4b built the session runner but calls
end with no persisted transcript or richer conversation outcome. Phase 5 adds inbound routing,
persists per-call records (both inbound and outbound) and lets Members see call history and
transcripts.

**Approach.** Per ADR-024:

1. Bind an Agent Version per caller number (`caller_numbers.inbound_agent_version_id`).
2. Reuse `VoiceSessionRunner` for inbound; the Exotel inbound adapter calls `runner.start()` on
   an incoming call event and persists `VoiceSessionResult` to a new `call_sessions` row on
   `close`.
3. Add `AgentHandoffService` and extend `VoiceProvider.transferCall` for the escalation step.
4. New table `call_sessions` holds the transcript, `conversation_outcome`, `telephony_outcome`,
   `qualification`, and usage counters for both inbound and outbound.
5. API: `GET /api/v1/calls` and `GET /api/v1/calls/:id` behind a new `calls.read` permission;
   `PUT /api/v1/caller-numbers/:id/inbound-config` behind `telecom.manage`.
6. Opt-out in an inbound call writes to suppression + consent ledger identically to outbound.

Out of scope: dynamic handoff routing (round-robin, voicemail, overflow), redaction of PII in
transcripts (Phase 10), caller analytics dashboards (Phase 10).

## Significant-feature questions (CLAUDE.md)

| Question                 | Answer                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data owner and tenant    | `call_sessions.organization_id` is derived from `caller_number.organization_id` (inbound) or `call_attempt.organization_id` (outbound). No cross-tenant reads.                                                      |
| Source of truth          | `call_sessions` is the authoritative call record. `call_attempts` stays as the dial state machine for outbound; the two FK each other.                                                                              |
| Authorization and audit  | New `calls.read` permission (same roles as `audit.read`). Inbound config changes audited. Transcripts are not emailed; they live in the API.                                                                        |
| Provider failure         | Inbound Exotel failure: the number plays a static sorry prompt and the attempt is logged as `PROVIDER_ERROR` with a null transcript.                                                                                |
| Duplicate delivery       | Exotel inbound webhook is idempotent on `provider_call_id`. If the same call arrives twice, the second attempt's upsert on `call_sessions.provider_call_id` wins and overwrites nothing new.                        |
| Worker crash / DB outage | A crashed inbound worker leaves the Exotel side holding the call; it drops when Exotel notices. Reconciliation on next startup finds no running session for a stuck provider_call_id and marks it `PROVIDER_ERROR`. |
| Usage and cost           | `call_sessions.usage` holds `inputTokens`, `outputTokens`, `audioSeconds`. Phase 8 reads them for metering.                                                                                                         |
| 100× scale               | A tenant with 20 numbers and 100 concurrent inbound calls needs ~100 workers; the inbound queue is per number. Transcripts are JSONB — compressed at rest; 1 MB cap per row.                                        |

## Acceptance

- Migration `0004_call_sessions.sql`: new table with FKs and indexes; `conversation_outcome` enum.
- `CallSessionsService.persist(result, …)` with a unit test (correct enums, token totals, upsert on `provider_call_id`).
- Permission `calls.read` added to the matrix with a unit test.
- `GET /api/v1/calls` paginated list integration test (cross-tenant isolation + filter by outcome).
- `GET /api/v1/calls/:id` returns a transcript integration test.
- `PUT /api/v1/caller-numbers/:id/inbound-config` audit log entry; integration test.
- `AgentHandoffService.escalate(callSessionId)` calls `voiceProvider.transferCall`; unit test.
- Web: new `/app/calls` list and detail pages behind `calls.read`.
- `npm run verify` green.
