# Production-readiness checklist

Nivomi is **not production-ready**. This checklist is the gate for the first paying pilot. Tick an
item only when its evidence exists: a passing test, a merged PR, a runbook, or a completed drill.

Status: ✅ done · 🟡 partial · ⬜ not started · ⛔ blocked (external dependency)

## Application

| Item                                                                           | Status | Evidence / gap                                                                                  |
| ------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------- |
| Nivomi-owned auth: Argon2id, rotating refresh tokens, reuse detection, lockout | ✅     | `it/auth.test.ts`                                                                               |
| Email verification and password reset                                          | ✅     | `it/auth.test.ts`, `tests/e2e/app.spec.ts`                                                      |
| MFA for owner, admin and Super Admin (PRD FR-5)                                | ⬜     | TECH_DEBT                                                                                       |
| RBAC from the central permission map                                           | ✅     | `it/organizations.test.ts`                                                                      |
| Cross-tenant isolation tests for every data-touching feature                   | 🟡     | Organizations, members, invitations and audit are covered; every later feature must add its own |
| Audit log for security and admin actions                                       | 🟡     | Auth and organization events; Super Admin events pending                                        |
| Error envelope, no internals leaked                                            | ✅     | `it/http.test.ts`, `it/degradation.test.ts`                                                     |
| Rate limiting across instances                                                 | 🟡     | Memory store; Redis store required before a second API task                                     |
| Idempotency keys on side-effecting POSTs                                       | ⬜     | With the first money- or call-moving endpoints                                                  |
| Background jobs: retry, backoff, dead letter, crash recovery                   | ✅     | `it/jobs.test.ts`                                                                               |
| Readiness endpoint for the load balancer                                       | ✅     | `GET /api/v1/health/ready`                                                                      |
| Frontend error boundaries                                                      | ✅     | `app/app/error.tsx`, `app/global-error.tsx`                                                     |
| Nonce-based CSP on the web app                                                 | ⬜     | TECH_DEBT                                                                                       |

## Providers

| Item                                                              | Status | Evidence / gap                         |
| ----------------------------------------------------------------- | ------ | -------------------------------------- |
| SES adapter, verified domain, SPF/DKIM/DMARC, bounce handling     | ⛔     | AWS account and domain (ADR-015)       |
| MSG91 OTP with DLT template                                       | ⛔     | MSG91 account, DLT registration        |
| Exotel, Sarvam, LLM adapters                                      | ⛔     | Accounts and credentials (ADR-011)     |
| HubSpot OAuth app                                                 | ⛔     | HubSpot developer account (ADR-012)    |
| Razorpay                                                          | ⛔     | Account; pricing not final (ADR-013)   |
| Provider failure behaviour tested per the provider failure matrix | 🟡     | Built rows tested; design rows pending |

## Infrastructure (AWS ap-south-1)

| Item                                                                                                | Status | Evidence / gap                                    |
| --------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------- |
| Infrastructure as code (ECS Fargate, RDS Multi-AZ, S3, ALB with `/api/v1/*` path rule, ElastiCache) | ⬜     | Phase 11                                          |
| Secrets in AWS Secrets Manager or SSM; none in images or env files                                  | ⬜     | `.env*` git-ignored; production refuses env files |
| Migrations run as a separate deploy step (`DATABASE_AUTO_MIGRATE=false`)                            | 🟡     | Supported by config; pipeline step not written    |
| CI deploy stage with manual approval for production                                                 | ⬜     | CI runs the quality gate only                     |
| Automated backups, point-in-time recovery and a completed restore drill                             | ⬜     | —                                                 |
| Test suite against real PostgreSQL in CI                                                            | ⬜     | TECH_DEBT                                         |
| `TRUST_PROXY=true` behind the ALB (exactly one hop)                                                 | ⬜     | Deploy configuration                              |

## Observability and operations

| Item                                                                                                          | Status | Evidence / gap            |
| ------------------------------------------------------------------------------------------------------------- | ------ | ------------------------- |
| Structured logs with request IDs and redaction                                                                | ✅     | `observability/logger.ts` |
| OpenTelemetry traces and metrics to Grafana Cloud (India region)                                              | ⬜     | ADR-016, Phase 10         |
| CloudWatch alarms (5xx rate, latency, RDS, queue depth, failed jobs)                                          | ⬜     | Phase 10                  |
| Cost dashboard (cost per call, per lead, provider spend)                                                      | ⬜     | Phase 10                  |
| Runbooks: incident, credential rotation (`AUTH_JWT_PREVIOUS_SECRET`), data breach (CERT-In, 6 hours), restore | ⬜     | —                         |
| Load test at 10× pilot volume                                                                                 | ⬜     | Phase 11                  |

## Compliance and legal

| Item                                                                       | Status | Evidence / gap                 |
| -------------------------------------------------------------------------- | ------ | ------------------------------ |
| Counsel-approved privacy policy and terms                                  | ⬜     | Website pages are placeholders |
| India rule set reviewed by counsel (TCCCPR, DLT, DND, calling hours, DPDP) | ⛔     | Counsel (ADR-014)              |
| Processor list and DPAs (AWS, Sarvam, LLM, HubSpot, Razorpay, Grafana)     | ⬜     | —                              |
| Retention matrix and data-rights request handling                          | ⬜     | PRD FR-121, FR-123             |
