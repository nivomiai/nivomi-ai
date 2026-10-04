---
title: 'Phase 7: HubSpot write-back, webhooks and deauthorization lifecycle'
type: 'feature'
created: '2026-10-04'
status: 'proposed'
route: 'build'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/decisions/ADR-026-crm-writeback-and-webhooks.md'
  - '{project-root}/docs/decisions/ADR-020-lead-ingestion-and-hubspot-inbound.md'
---

## Intent

**Problem.** ADR-020 pulls data from HubSpot; business events in Nivomi (call outcomes, status
changes, opt-outs, appointments) are invisible to HubSpot users. Phase 7 closes the loop with a
write-back path and verified webhooks, keeping Nivomi authoritative (ADR-017) and HubSpot in
sync as a projection.

**Approach.** Per ADR-026:

1. Four outbox job types that push projections to HubSpot: `crm.push_lead_status`,
   `crm.push_call_outcome`, `crm.push_opt_out`, `crm.push_appointment`. Each is enqueued in the
   same transaction as the business write and idempotent on the projection hash.
2. HubSpot adapter method per projection (`pushLeadStatus`, `pushCallOutcome`, `pushOptOut`,
   `pushAppointment`), with the existing fake-HubSpot server covering them for integration tests.
3. One inbound webhook endpoint: `POST /api/v1/webhooks/hubspot` with signature verification
   and replay protection; handles `contact.propertyChange`, `contact.deletion`,
   `oauth.deauthorization`.
4. Token lifecycle: refresh 5 min before expiry; `invalid_grant` → mark REVOKED + move pending
   jobs to DLQ with `crm_disconnected`.
5. Rate limiter per `(install_id, org_id)` through `RateLimitStore`.
6. Web: show connection status, webhook URL, and the DLQ count for the connection.

Out of scope: creating HubSpot objects from Nivomi (no outbound contact creation), deal /
pipeline integration, two-way merge beyond ADR-020.

## Significant-feature questions (CLAUDE.md)

| Question                 | Answer                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Data owner and tenant    | Jobs read tenant-owned business state and write to tenant-owned `crm_sync_jobs`. Webhook events are matched to `crm_installations.id`. |
| Source of truth          | Nivomi (ADR-017). HubSpot stores the projection; a conflict always resolves toward Nivomi.                                             |
| Authorization and audit  | Webhooks: signature-verified, no auth. Admin-visible actions audited. No new user permissions.                                         |
| Provider failure         | HubSpot 429/5xx: exponential backoff + jitter; `invalid_grant`: fail-closed to DLQ with `crm_disconnected`.                            |
| Duplicate delivery       | Outbox idempotency key = `sha256(organization_id                                                                                       | kind | entity_id | projection_hash)`; replays are no-ops. |
| Worker crash / DB outage | Outbox is PG-backed (ADR-019); crashed workers resume from `WAITING`. Transactional business write + enqueue prevents orphan jobs.     |
| Usage and cost           | HubSpot free tier call cap is 110 req/10s per app; the shared limiter prevents a single org from monopolizing it.                      |
| 100× scale               | 100 outbox jobs/s per worker is comfortable; the per-connection token bucket backs off before HubSpot throttles.                       |

## Acceptance

- Migration `0006_crm_writeback.sql` with `crm_sync_jobs` table and projection-hash unique index.
- Adapter methods implemented against the fake-HubSpot server; four integration tests, one per
  projection, exercising business write → outbox → adapter → fake.
- Webhook endpoint signature-verified integration test (reject bad signature, reject replay).
- Deauthorization lifecycle test (revoke → DLQ → re-connect → DLQ drained on resume).
- Web: "HubSpot connection" page shows status, DLQ count, "test write-back" button (dev-only).
- `npm run verify` green.

## Deferred to adapter PR (HubSpot developer app on hold)

- Real HubSpot developer app, client id/secret in Super Admin.
- `POST /oauth/2026-03/token/revoke` once request body is documented (TECH_DEBT note already in place).
