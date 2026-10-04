# ADR-029: Analytics and observability — OpenTelemetry, product metrics, PII handling

- **Status:** Accepted
- **Date:** 2026-10-04
- **Builds on:** ADR-010 (AWS hosting, CloudWatch for infra), ADR-016 (OTel → Grafana Cloud,
  India region)

## Context

ADR-016 chose OTel → Grafana Cloud (India) for app telemetry and CloudWatch for infra. Phase 10
turns that choice into working code: tracing, metrics, logging, product analytics inside the
customer app, and the dashboards that the on-call will actually read.

## Decision

### 1. OpenTelemetry wiring

- A single `@nivomi/observability` package exports:
  - `createTelemetry(env)` — initialises the SDK (OTLP HTTP exporter → Grafana Cloud, resource
    attributes `service.name`, `service.version`, `deployment.environment`, `tenant.id`
    (per-request).
  - A Nest `TelemetryModule` that wires the Nest HTTP + Interceptor + Logger (pino → OTel log
    bridge).
- Tracing is **on by default** in all environments except unit tests. Spans:
  - HTTP request (one per request)
  - Database query (via a Drizzle wrapper that records query duration, rows, SQL fingerprint,
    not the SQL body itself)
  - Job execution (one span per job dequeue)
  - Provider call (one span per outbound HTTP: HubSpot, SES, MSG91, Razorpay, Exotel, Sarvam,
    LLM)
  - Voice session (one span per call; nested child spans per turn)
- Sampling: head-based 10 % by default; errors and traces that include a Super Admin action
  are **always sampled**.

### 2. Product metrics inside the customer app

- `/app/analytics` renders four cards:
  - Minutes called this period (per campaign, per agent version)
  - Call outcomes breakdown
  - Lead status funnel (NEW → CONTACTED → QUALIFIED → …)
  - Compliance deferrals (DEFERRED reason codes)
- Backed by read-only materialized views (`analytics.*`), refreshed every 15 min by a job.
- Super Admin sees the platform rollup.

### 3. PII redaction in logs and transcripts

- Request log redaction extends to:
  - call transcripts emitted in traces → **replace** with `transcript.summary = {turns, outcome}`
  - email bodies in SES jobs → **replace** with template id + anonymised payload
  - any `password|token|secret|otp|cardNumber|aadhaar|cvv|razorpayKey|hubspotKey` path
- The `REDACTED_PATHS` constant is the single source of truth; a lint rule enforces that no
  log call includes a bare `password` or `token` field (`no-restricted-syntax`).

### 4. Dashboards and alerts (Grafana Cloud, India region)

- Dashboard 1: **Platform health** — p95 request latency, error rate, DB saturation, queue
  depth, DLQ growth.
- Dashboard 2: **Call quality** — call volume, p95 turn-latency per stage (STT final, LLM
  first token, TTS first audio), outcome distribution.
- Dashboard 3: **Compliance** — deferrals by reason, suppression growth, complaint-breaker
  state per org.
- Alerts (PagerDuty / email until on-call rotation chosen):
  - API error rate > 2 % over 5 min
  - DLQ > 50 items
  - Complaint breaker tripped for any org
  - Payment webhook signature verification failures > 0 in 10 min
  - Any Super Admin impersonation session active for > 30 min

### 5. CloudWatch for AWS infrastructure

CloudWatch stays with ECS Fargate, RDS, ElastiCache, S3 (infra-level metrics only). App metrics
are exclusively on Grafana Cloud so a single query answers "p95 for tenant X" without crossing
systems.

## Consequences

- Every provider adapter must open a span (contract: ADR-029 §1); the shared `providerCall`
  helper handles it.
- Dashboards are themselves artefacts — kept in `ops/dashboards/*.jsonnet` and provisioned via
  Grafana Cloud API. TECH_DEBT: provisioning script lands with Phase 11.
- Deferred to Phase 11: production hostname, mTLS to Grafana Cloud, log retention policy.
