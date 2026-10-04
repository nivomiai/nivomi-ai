# ADR-030: Deploy and hardening — AWS adapters, infra plan, prod-readiness gate

- **Status:** Accepted
- **Date:** 2026-10-04
- **Builds on:** ADR-010 (AWS ap-south-1, ECS Fargate), ADR-015 (SES, MSG91), ADR-016 (OTel,
  CloudWatch), ADR-019 (jobs, rate-limit store), ADR-028 (notifications), ADR-029 (observability)

## Context

Everything built so far runs on dev stand-ins: PGlite (DB), local file storage, static
credential encryption key, in-memory rate limiter, in-process fake HubSpot, simulated voice /
STT / TTS / LLM, dev mailbox. Production refuses to start until the real adapters are
configured (ADR-006 fail-fast). Phase 11 writes those adapters, builds the infrastructure, and
runs the production-readiness checklist.

## Decision

### 1. Adapters to implement in order

Each is one PR, each gated by the real external account:

1. **`S3StorageProvider`** (AWS S3 ap-south-1, SSE-KMS, presigned PUT URLs; malware scanning
   via GuardDuty S3 Protection or `Clamav` sidecar on a Lambda trigger).
2. **`SesEmailProvider`** (AWS SES ap-south-1; configuration set with event destinations into
   Grafana via SNS).
3. **`Msg91OtpProvider`** (DLT SMS template approved; webhook for delivery status).
4. **`KmsCredentialEncryptor`** (KMS envelope encryption; replaces the static credential key).
5. **`RedisRateLimitStore`** (ElastiCache Redis; replaces `MemoryRateLimitStore`).
6. **`ExotelVoiceProvider`** + **`SarvamSTTProvider`** + **`SarvamTTSProvider`** (ADR-023's
   deferred adapters).
7. **`RazorpayPaymentProvider`** (ADR-027's deferred adapter).
8. **LLM adapter** (vendor from the still-open evaluation — ADR-011; carried behind an
   `LLMRouter` so swapping is cheap).

### 2. Infrastructure plan (Terraform under `infra/`)

Modules:

- `network` — VPC, subnets (public ALB, private app, isolated data), NAT.
- `data` — RDS PostgreSQL 17 Multi-AZ, ElastiCache Redis, S3 buckets (uploads, recordings,
  invoices, Grafana log dump), KMS keys (one per concern: credentials, PII at rest).
- `app` — ECS Fargate services (api, worker, voice-worker), ALB, ACM cert, Route 53.
- `email_sms` — SES configuration set, MSG91 secret in Secrets Manager (manual seed; app reads).
- `telephony` — Exotel account credentials in Secrets Manager; VPC endpoint if Exotel exposes
  one.
- `observability` — CloudWatch alarms for infra; the Grafana Cloud OTel exporter runs inside
  the task (no CloudWatch for app telemetry).

Deployed by GitHub Actions on push to `main` (staging) and tagged releases (production). Blue
/ green via ECS deployment config; database migrations run before swap.

### 3. Production-readiness gate (hard, not advisory)

Before production launch (block the deploy on red):

- All provider adapters configured; `ApiEnv` parse succeeds in prod mode (no simulated
  providers).
- India rule set version marked `APPROVED` (counsel sign-off); DRAFT fails closed.
- SES: SPF / DKIM / DMARC pass; MSG91 DLT template active.
- Backups: RDS automated backups + a weekly manual snapshot kept 90 days.
- DLQ dashboard quiet for 24 h in staging.
- MFA enforced for all SUPER_ADMIN accounts; no grace period in prod (ADR-028 §4).
- Security review: `security-review` skill run against the branch; findings resolved or
  explicitly deferred with an issue.
- Load test: 1 K rps on the API, 100 concurrent calls on the voice worker, no regressions.
- Playbook: on-call rotation, pager routing, incident template.

The checklist in `docs/operations/production-readiness-checklist.md` is the authoritative
version; this ADR only states the gate exists.

### 4. Secret management

- Platform secrets in AWS Secrets Manager; task definitions reference them.
- Per-tenant credentials (HubSpot refresh tokens, caller numbers DLT ids) stay in Nivomi DB,
  encrypted via the new `KmsCredentialEncryptor` (envelope: data key per org, KMS CMK rotating
  annually).

### 5. Rollback

- Blue/green ECS deploy with automatic rollback on health-check failure.
- Database migrations are forward-only; a bad migration is rolled forward by a reverse
  migration in a follow-up deploy. Snapshot-restore is the last resort.
- Feature flags on sensitive new features (set in Super Admin DB) so a bad behaviour can be
  switched off without a deploy.

## Consequences

- Phase 11 is largely configuration-heavy, not product code; most of the work has already
  landed through adapter PRs tied to earlier phases.
- The hold list closes here: HubSpot developer app, AWS account, Exotel, Sarvam, Razorpay,
  MSG91, Grafana Cloud, LLM vendor.
- Deferred: multi-region, read replicas, chaos testing (post-launch roadmap).
