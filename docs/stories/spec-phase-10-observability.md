---
title: 'Phase 10: Analytics and observability — OTel SDK, product metrics, PII redaction, dashboards'
type: 'feature'
created: '2026-10-04'
status: 'proposed'
route: 'build'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/decisions/ADR-029-analytics-and-observability.md'
---

## Intent

**Problem.** The platform has pino logs and nothing else. We can't trace a slow call, we can't
answer "p95 of STT final time for tenant X", we can't see where campaigns pile up. The customer
app has no analytics screen. Phase 10 ships the telemetry pipe, PII redaction, product
analytics, and the three dashboards on-call will read.

**Approach.** Per ADR-029:

1. New `@nivomi/observability` package: `createTelemetry`, Nest module, Drizzle wrapper,
   `providerCall` helper, redaction config.
2. Four materialized views + a 15-min refresh job backing `/app/analytics`.
3. Lint rule enforcing redaction.
4. Three Grafana dashboards checked in under `ops/dashboards/*.jsonnet`.
5. Alert rules checked in under `ops/alerts/*.yaml`.

Out of scope: real-time log tailing in the UI, a dedicated error-tracking service (Sentry-like)
— TECH_DEBT.

## Significant-feature questions (CLAUDE.md)

| Question                 | Answer                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data owner and tenant    | Spans and metrics are platform-owned (Grafana Cloud); every span carries `tenant.id` so queries filter per tenant. Analytics views are tenant-partitioned. |
| Source of truth          | Grafana for timeseries; app DB for product analytics materialized views.                                                                                   |
| Authorization and audit  | New `analytics.read` permission (same roles as `audit.read`). Dashboard provisioning audited.                                                              |
| Provider failure         | OTLP exporter failure → logs retained locally with the request ID; no business impact.                                                                     |
| Duplicate delivery       | Metrics are counters/gauges; replays are idempotent by design.                                                                                             |
| Worker crash / DB outage | Materialized view refresh is idempotent; crashed worker resumes.                                                                                           |
| Usage and cost           | Grafana Cloud ingestion metered externally; sampling at 10 % head-based keeps cost bounded.                                                                |
| 100× scale               | 10 K req/s × 10 % = 1 K spans/s; well within one agent's capacity. Views refreshed every 15 min bound DB load.                                             |

## Acceptance

- `@nivomi/observability` package with `createTelemetry` + Nest module.
- Drizzle wrapper adds query spans with duration + rowcount + fingerprint (not SQL body).
- `providerCall` helper used by every provider adapter (CRM, SES stub, MSG91 stub, Razorpay
  stub, Exotel stub, Sarvam stub, LLM stub).
- Migration `0009_analytics_views.sql`: four materialized views.
- `/app/analytics` renders four cards.
- Lint rule rejects raw `password|token|otp|…` keys in log calls (fix: audit existing uses).
- Three dashboards checked in under `ops/dashboards/`.
- Five alert rules checked in under `ops/alerts/`.
- `npm run verify` green.

## Deferred to adapter PR

- Grafana Cloud account + API key (parked with the AWS hold — Grafana Cloud India is a separate
  signup, can proceed earlier if owner wants).
- Dashboard provisioning via Grafana API (Phase 11 scope).
