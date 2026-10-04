# ADR-026: HubSpot write-back and webhooks — outbound CRM sync

- **Status:** Accepted
- **Date:** 2026-10-04
- **Builds on:** ADR-012 (HubSpot per-tenant OAuth), ADR-017 (Nivomi domain authoritative),
  ADR-020 (inbound sync)

## Context

ADR-020 built inbound HubSpot sync (OAuth, contacts, companies, HubSpot Leads, full and 15-min
incremental). Phase 7 adds the write-back half: when a Nivomi call changes a lead's status,
books an appointment, or opts a contact out, that change is reflected in HubSpot. The HubSpot
developer app is on hold (`docs/planning/status-holds-and-next.md`); work proceeds against the
in-process fake HubSpot used by Phase 2 tests.

## Decision

### 1. Nivomi stays the source of truth (ADR-017)

Write-back pushes **projections** of Nivomi state to HubSpot:

- Lead status (Nivomi `leads.status`) → HubSpot lifecycle stage / custom property
- Call outcome (Nivomi `call_sessions`) → HubSpot timeline / "Last call" custom property
- Opt-out (Nivomi `suppression_entries`) → HubSpot `hs_marketable_until_renewal` + a custom
  "do not call" property, plus unsubscribe-list membership
- Appointment (Nivomi `appointments`) → HubSpot engagement (meeting type)

HubSpot never writes back to Nivomi for these fields. The 15-min incremental sync from ADR-020
remains the "truth-up" leg for everything else (names, emails, phone changes).

### 2. The outbox pattern (ADR-019 jobs)

Every write-back is enqueued as a job in the same transaction as the business write:

- `crm.push_lead_status`, `crm.push_call_outcome`, `crm.push_opt_out`, `crm.push_appointment`
- Each job is idempotent on `(organization_id, nivomi_entity_id, projection_hash)`; the
  projection hash is of the HubSpot-shaped payload. Re-running with the same hash is a no-op.
- The CRM adapter translates the Nivomi payload to HubSpot's API shape; the Nivomi domain never
  speaks HubSpot vocabulary.

### 3. HubSpot webhooks (inbound)

Phase 7 opens one inbound webhook per installed app, verified on the shared app secret:

- `contact.propertyChange` → triggers a point-targeted incremental sync (not a full one) for
  the affected contact
- `contact.deletion` → tombstones the Nivomi contact (never deletes; archives + records a
  `source_contact_tombstone` event so campaign exclusion kicks in)
- `oauth.deauthorization` → marks the connection REVOKED, drops stored tokens

Signatures verified with `X-HubSpot-Signature-v3` and the raw request body. Replays rejected by
timestamp window (5 min) + per-event idempotency key.

### 4. Deauthorization and token expiry

- Access token refresh runs 5 min before expiry (the token lifetime is 30 min; refresh tokens
  never expire).
- When a refresh fails with `invalid_grant`, the connection is marked REVOKED and all pending
  write-back jobs for that org are moved to the dead-letter queue with reason
  `crm_disconnected`. The customer app shows "HubSpot disconnected — reconnect to resume sync".

### 5. Per-org throttling

HubSpot's free tier is 110 req/10s per installed app, per account. The adapter uses a shared
token bucket keyed by `(install_id, org_id)` through `RateLimitStore` (ADR-019). TECH_DEBT:
move the limiter to the Redis store before scaling past one API task.

### 6. API

- `GET /api/v1/integrations/hubspot/connection` returns the connection status and the webhook
  URL.
- `POST /api/v1/integrations/hubspot/test-writeback` queues a test job (audit=true) to confirm
  end-to-end plumbing without needing to make a real call. Dev-only in production until the
  real HubSpot app is open.

## Consequences

- All write-back is behind an outbox, so a HubSpot outage never fails a Nivomi call or
  appointment write.
- Phase 7 lands fully against the in-process HubSpot fake; the real adapter needs the HubSpot
  developer app from the hold list.
- Deferred: object creation (Nivomi creating a HubSpot contact from inbound call capture),
  deal/pipeline integration (not MVP), two-way merge of a HubSpot name change into Nivomi
  (already handled by ADR-020 incremental sync — this ADR only adds the write-back half).
