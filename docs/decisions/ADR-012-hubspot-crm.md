# ADR-012: HubSpot as first CRM, per-tenant OAuth, Nivomi as source of truth

- **Status:** Accepted
- **Date:** 2026-09-25

## Decision

- HubSpot is the MVP CRM, integrated through `CRMProvider` with a `HubSpotAdapter`.
- **Each organization connects its own HubSpot account** through OAuth. A `crm_connection` row
  belongs to exactly one organization and holds encrypted tokens (KMS envelope encryption), the
  HubSpot portal ID, granted scopes and status. Tokens never reach the browser or logs.
- **Nivomi PostgreSQL is authoritative** for Nivomi domain data (customers, statuses, calls,
  appointments). HubSpot is an external system kept in sync.
- **Outbound sync is asynchronous:** a domain event is written through the outbox, then a CRM
  sync worker pushes it to HubSpot. Jobs are idempotent (keyed by event ID and target object),
  retried with backoff, rate-limit aware and dead-lettered after exhaustion. Per-record sync state:
  `PENDING`, `SYNCING`, `SYNCED`, `FAILED`, `RETRYING`.
- **Inbound changes** arrive through HubSpot webhooks. They are signature-verified, mapped to the
  owning organization by portal ID, deduplicated and applied through the same domain services as
  any other source.
- A HubSpot outage or revoked token never fails the business action; it surfaces as sync state
  and an alert to the organization.

## Consequences

- Cross-tenant safety depends on routing every job and webhook to the right `crm_connection`.
  Tenant-isolation tests must cover webhooks and workers, not only the API.
- Field mapping (Nivomi fields to HubSpot properties) needs a per-organization configuration model.
- Scopes, webhook subscriptions, rate limits and API versions must follow HubSpot's current
  official documentation.
