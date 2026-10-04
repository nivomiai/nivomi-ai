# Production readiness plan

_Written 2026-09-29. The single-page answer to "what is left to turn Nivomi AI into a real
production SaaS?" — sequenced, with a rough size for each item and a test at the end that says
"we're done"._

Read together with:

- [implementation-plan.md](implementation-plan.md) — the 11 phases and their dependencies.
- [status-holds-and-next.md](status-holds-and-next.md) — what's done today and what the owner has
  parked.
- [requirements-matrix.md](requirements-matrix.md) — per-requirement status.
- [../TECH_DEBT.md](../TECH_DEBT.md) — known gaps that never became a story.

## 0. Where we stand today (2026-09-29)

Built and covered by tests:

- **Auth** (ADR-018): sign-up, verify, login, password reset, sessions, rate limits.
- **Organizations + RBAC** (six roles, per-endpoint `@RequirePermission`), invitations, audit log.
- **Contacts, leads, imports** (CSV/XLSX, mapping, preview, dedupe queue, suppression).
- **HubSpot inbound sync** (behind `CRMProvider`; optional per organization).
- **Compliance engine + India rule set v1 (DRAFT)** with eligibility decisions.
- **Campaigns + simulated dialler** (create, pre-launch check, pacing, retries, Emergency Stop,
  complaint breaker).
- **Telecom identity + caller numbers**.
- **Super Admin console MVP (this branch)**: `isSuperAdmin` on `/me`, platform organizations
  list, approve / suspend / reactivate / close (audited, idempotent), cross-tenant audit log,
  new nav section, e2e tests.
- **Public site**: static homepage from the `nivomiai/website` repo plus React chrome across
  `/privacy`, `/terms`, `/coming-soon/*` with a Login button into the app.

Standing owner holds (from status-holds-and-next.md):

- HubSpot developer app and AWS ap-south-1 account are **parked until every phase is complete**.
  Everything runs against a local fake or a dev adapter; production fails fast if a fake is
  configured.

## 1. Phase 4 — Voice loop and call history (highest business value)

Nothing looks like a real AI-voice product until this ships. Break Phase 4 into three slices so
each one ends with something demoable and green.

### 4a. Turn-taking loop with fakes (~2 weeks)

Deliverables:

- `LLMProvider` interface + one adapter (OpenAI or Anthropic) + a **fake** for tests.
- `STTProvider` and `TTSProvider` interfaces + fakes.
- `VoiceProvider` stays simulated; the dialler now runs a real conversation turn machine.
- `CallRecord`, `CallEvent` schemas; state machine; transcripts + AI summaries (async job).
- Web: **Calls** screen (list, filter, drawer with transcript + summary + score).

Done when: an owner runs a campaign against a seeded lead list, sees each simulated call end
with a real transcript and summary, in permitted hours, respecting the eligibility engine.

### 4b. Real speech (~1–2 weeks)

Sarvam STT/TTS adapters behind the existing interfaces. Add a browser test caller so an owner
can hear an agent respond, without any telephony provider.

Done when: an owner clicks "Call me now" on their laptop and holds a two-way conversation with
their configured AI Manager, en/hi/ml/ta/te/kn.

### 4c. Real telephony (~2–4 weeks, blocked on Exotel)

Exotel adapter for `VoiceProvider`; DLT-registered outbound and inbound. Real recordings stored
via `StorageProvider` (local now, S3 later).

Done when: a campaign places a real outbound call on an Exotel test number; a call rings in on a
140xx number and reaches the AI Manager or a human on escalation.

## 2. Phase 5 — Inbound calls (~1 week after 4c)

- Inbound routes: AI, human, AI → human.
- Business hours, voicemail, missed-call callback.
- The `CallOutcome` addendum mapping already covers this; wire it through inbound.

Done when: an inbound call is answered by the assigned AI Manager, escalates to a human when the
policy says so, and shows up on the Calls screen with the right route.

## 3. Phase 6 — Appointments (~1 week)

- Nivomi-owned Appointment records; availability windows per organization.
- `CalendarProvider` interface + one adapter (Google Calendar) + a fake.
- Book from a call, from a WhatsApp reply, or manually.

Done when: a qualified call ends with an appointment on the owner's calendar within 5 seconds.

## 4. Phase 7 — CRM write-back (~1–2 weeks; HubSpot on hold)

The `CRMProvider` interface is in place; inbound sync ships in Phase 2. Add:

- Outbound sync: call outcomes, notes and appointments pushed back on a queue.
- Field-ownership rules (which side wins on conflict).
- Webhooks from HubSpot for downstream changes (with signature verification + idempotency).
- The same interface accepts a second CRM later — no change to campaigns.

Done when: a completed call updates the linked HubSpot contact and creates a HubSpot note within
30 seconds; a delete in HubSpot marks the Nivomi lead as REMOVED without breaking the audit
trail.

## 5. Phase 8 — Usage, quotas and billing (~2 weeks)

- `UsageEvent` table + a rollup job per organization per day.
- Per-call and per-lead cost tracking (LLM tokens, STT/TTS minutes, telephony minutes, SMS/OTP).
- Plans as data (Starter, Growth, Scale); per-plan quotas enforced by a job before every dial.
- `PaymentProvider` interface + Razorpay adapter (subscriptions, one-off top-ups, webhooks).
- Invoices (PDF via the storage provider).

Done when: an owner sees a live "credits remaining" figure that ticks down as calls complete;
Razorpay test webhooks flip an organization from PENDING_PAYMENT to ACTIVE; overage blocks new
dials.

## 6. Phase 9 — Notifications, OTP, Super Admin, MFA

Ship as three separate stories:

### 9a. Email + OTP adapters (~1 week)

- SES adapter for `EmailProvider` (replacing the dev mailbox in prod).
- MSG91 adapter for `OtpProvider` (phone verification, DLT SMS templates).
- In-app notifications: a `notifications` table + a bell in the header.

### 9b. Super Admin console v1 (~1 week, then keep growing)

Already started this branch (organizations, audit). Round it out with:

- Impersonation with a big red banner and a full audit trail.
- Provider configuration (feature flags, per-plan quotas, rule-set versions) as DB rows editable
  in the console.
- Complaint records viewer + telecom identity review (endpoints already exist).
- Rate-limit rules viewable and adjustable per organization (behind the same `RateLimitStore`).

### 9c. MFA (~1 week)

- TOTP for every account; enforced for Super Admins.
- Recovery codes.
- WebAuthn (later — behind a flag).

## 7. Phase 10 — Analytics and observability (~2 weeks)

- OpenTelemetry traces + metrics → Grafana Cloud (India region).
- Structured pino logs with request/tenant/job IDs (already in place; extend for calls).
- Per-organization dashboards: cost per call, cost per qualified lead, connection rate, time to
  first answer, drop-off by step.
- SLOs: p95 turn latency < 2 s (ADR-011), API p95 < 300 ms, 99.9 % availability outside planned
  maintenance.

## 8. Phase 11 — Deploy and hardening

Only after every phase above is done, because it's when the AWS + HubSpot holds are released.

### 11a. Security hardening (a week of dedicated review)

- **Content-Security-Policy** with a per-request nonce (currently a TECH_DEBT item — the app
  proxy already prepares for it). No `unsafe-inline`.
- **CSRF**: the origin guard is in place; add a double-submit cookie for the few state-changing
  GETs (webhooks) and confirm every POST/PUT/DELETE is verified.
- **Cookies**: `Secure`, `HttpOnly`, `SameSite=Lax`; verify the refresh cookie is rotated on every
  use (ADR-018).
- **Rate limits**: pull `RATE_LIMITS` values into DB, editable per organization, with sensible
  defaults. Add rules for `/imports`, `/leads`, `/campaigns/emergency-stop` (this last one very
  low).
- **Secrets rotation**: `AUTH_JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, provider keys — 90-day
  rotation with envelope encryption via AWS KMS.
- **Uploads**: malware scanning before every import (S3 event → Lambda → verdict written to the
  import job). Reject on any hit.
- **Dependency review** on every PR (already partly wired through `npm audit`).
- **Security review** as its own story before launch.

### 11b. Performance (~1 week)

- **Response cache** headers on read-only, non-sensitive endpoints: `/organizations/current`,
  `/organizations/current/roles`, `/leads` (private, short TTL).
- **DB indices**: add per real query patterns spotted in Phase 4 (call attempts by campaign +
  status; audit logs by resource; imports by organization + status).
- **Connection pool** sized per environment; pgbouncer between the app and RDS in production.
- **Load test** with k6: 200 rps mixed authenticated read, 20 rps write, 200 concurrent calls;
  goal p95 < 300 ms API, error rate < 0.1 %.

### 11c. Infrastructure (Phase 11 proper)

- Terraform in `ops/infra/` for AWS ap-south-1: VPC, ECS Fargate, RDS PostgreSQL, ElastiCache
  Redis (for `RateLimitStore` + jobs coordination once we scale past one instance), S3, KMS,
  SES, CloudWatch.
- CI deploy pipeline (GitHub Actions → OIDC → ECR + ECS blue/green).
- Runbooks: on-call, incident response, backup/restore, credential rotation, dependency
  vulnerabilities.
- Backup + restore test (quarterly): full RDS restore from PITR into an isolated environment.

## 9. Cross-cutting UI/UX polish (interleaves with every phase)

Not a phase — a rolling checklist for every screen we ship or touch.

- Consistent header spacing, panel padding and typography (tokens live in
  `apps/web/app/globals.css`).
- Every list has: empty state, loading state, error state with retry.
- Every action that mutates: optimistic disable, error surface, success confirmation.
- Every long form: unsaved-changes guard.
- Every table: keyset pagination (never offset), sortable columns when there's a reason.
- Every screen: keyboard-friendly, focus-visible, reduced-motion respected.
- Accessibility: at least axe-clean at CI time; announced live regions on critical async work.
- Dark theme reviewed page by page as we go.

## 10. Definition of production-ready

The launch gate lives at
[../operations/production-readiness-checklist.md](../operations/production-readiness-checklist.md).
Every item must be green:

- [ ] All 11 phases delivered; retrospective written.
- [ ] `npm run verify` green, e2e green, load test green.
- [ ] Security review closed (no open Sev-High findings).
- [ ] Owner-signed legal review of the India Rule Set — status flipped from DRAFT to APPROVED.
- [ ] TRAI Third Amendment effective dates published as rule data.
- [ ] Exotel, Sarvam, Razorpay, MSG91, HubSpot production accounts live.
- [ ] AWS ap-south-1 provisioned; on-call rota active; runbooks ready.
- [ ] Backup/restore rehearsed within the last 90 days.
- [ ] Observability dashboards live; SLOs monitored with page-outs.

## 11. Sequencing (recommended)

Fastest path from where we are today to a Dograh-comparable working demo, without needing any of
the parked accounts:

1. Phase 4a (voice loop with fakes) — **most demoable, no external dependencies**.
2. Phase 4b (real speech via Sarvam).
3. Phase 9b (finish Super Admin console) — done in parallel from step 2.
4. Phase 4c (real Exotel telephony) — once the Exotel account is opened.
5. Phase 5 (inbound) → Phase 6 (appointments) → Phase 7 (CRM write-back).
6. Phase 8 (billing).
7. Phase 10 (observability), Phase 11 (deploy + hardening).
