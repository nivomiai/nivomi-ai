# Nivomi implementation plan

> **Written:** 2026-09-26, from the production implementation brief, the PRD (revision 2) and
> ADRs 001–019.
> **Scope:** how the repository goes from its current state to the full MVP.
> **Tracking:** status per requirement lives in [requirements-matrix.md](requirements-matrix.md).

## 1. Where the repository is today

| Area                                                                          | State                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------------- |
| Monorepo, CI, config validation, logging and request IDs, error envelope      | Done (bootstrap)                                |
| Public website: homepage, 6 Coming Soon pages, legal placeholders             | Done (PR #7)                                    |
| PRD, compliance research, ADRs, provider plan                                 | Done (PR #5)                                    |
| Voice spike: Exotel, Sarvam and LLM loop                                      | Built; waiting for provider credentials (PR #6) |
| Database, auth, tenancy, RBAC, product domain, workers, providers, product UI | **Not started**                                 |

**Contradictions between the brief and earlier documents, and how they are resolved:**

1. **Clerk (ADR-009) vs "Do NOT use Clerk".** Resolved by ADR-018: Nivomi-owned JWT
   authentication.
2. **ADR-010 put queues on ElastiCache.** ADR-019 moves MVP jobs to PostgreSQL, because it is
   cheaper and keeps jobs transactional with the data. Redis stays for rate limits and caching
   once there is more than one instance.
3. **"Roles and permissions" tables vs the PRD's fixed six roles.** The permission matrix lives
   in code (PRD §8.1), because MVP roles are fixed. Custom roles are post-MVP, so there are no
   role tables yet.
4. **The brief's CRM list (Salesforce, Zoho, Freshsales).** Only HubSpot is in the MVP (PRD).
   `CRMProvider` stays generic.

## 2. Principles for delivery

- **Vertical slices.** Each slice runs from database to API to UI to tests, in dependency order.
  Each ends with a green `npm run verify` and a commit.
- **No hidden fakes.** Provider adapters that cannot be exercised without credentials (Exotel,
  Sarvam, HubSpot, Razorpay, SES, MSG91) sit behind their interfaces. Development uses clearly
  named local implementations, such as the dev mailbox email or simulated voice. Production
  refuses to start with a development provider configured.
- **Tenant isolation tests ship with every data-touching slice** (CLAUDE.md).

## 3. Phases

| #                         | Phase                                  | Contents                                                                                                                                                                                                                                                                                                                                                                                                           | Depends on / blocked by                                     |
| ------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| 1                         | **Platform foundation**                | `packages/database` (Drizzle, migrations, PGlite/pg); auth (ADR-018); organizations and memberships; invitations; RBAC `PermissionService` and guard; audit log; rate limiting (memory store); jobs table and worker; `EmailProvider` (dev mailbox); error envelope v2 (`success`, `retryable`); web: sign-up, login, email verification, password reset, organization setup, app shell, team, sessions, audit log | —                                                           |
| 2 (done)                  | Contacts, leads, imports               | Contact, Lead and Company records; source metadata; Excel/CSV upload (`StorageProvider`: local now, S3 later); import jobs with mapping, preview, dedupe and error report; suppression list; status engine                                                                                                                                                                                                         | 1; OD-3 (consent evidence default applied)                  |
| 3                         | Compliance and campaigns               | `ComplianceEngine` with the India Rule Set v1 as data; eligibility decisions; telecom identity and phone numbers; campaigns (static and continuous), pacing, retries, budgets, emergency stop                                                                                                                                                                                                                      | 2; legal review of the rule set (VQ-3/4/6)                  |
| 4                         | Calls and call history                 | Call records, events and state machine; `VoiceProvider`, `STTProvider`, `TTSProvider`, `LLMProvider` interfaces; simulated voice for development; transcripts, AI summaries (async), recordings (S3 references); escalation state machine, human tasks, callbacks; call-history list and detail UI                                                                                                                 | 3; Exotel and Sarvam credentials (Wave 1) for real adapters |
| 5                         | Inbound calls                          | Inbound routes (AI, human, AI → human), business hours, voicemail                                                                                                                                                                                                                                                                                                                                                  | 4; OD-2                                                     |
| 6                         | Appointments                           | Appointments owned by Nivomi, availability windows, `CalendarProvider`                                                                                                                                                                                                                                                                                                                                             | 4; OD-1                                                     |
| 7 (inbound done, ADR-020) | CRM                                    | `CRMProvider` and HubSpot adapter: OAuth, ingestion, outbound sync, webhooks, field ownership                                                                                                                                                                                                                                                                                                                      | 2, 4; HubSpot developer app                                 |
| 8                         | Usage, quotas, billing                 | Usage events, quotas, cost tracking per call and lead; `PaymentProvider` with Razorpay subscriptions and webhooks; invoices                                                                                                                                                                                                                                                                                        | 4; OD-4 (pricing), Razorpay test keys                       |
| 9                         | Notifications, email, OTP, Super Admin | SES adapter, MSG91 OTP (phone verification), in-app notifications; Super Admin control plane (organization approval, audit viewer, provider configuration, plans and flags) and MFA                                                                                                                                                                                                                                | 1; domain, DLT registration                                 |
| 10                        | Analytics and observability            | Dashboards, side-effect metrics, OpenTelemetry to Grafana Cloud (India), cost per call and lead                                                                                                                                                                                                                                                                                                                    | 4, 8                                                        |
| 11                        | Deploy and hardening                   | Terraform/CDK for AWS ap-south-1, CI deploy, Redis rate-limit store, security review, load test, restore test, runbooks                                                                                                                                                                                                                                                                                            | all; AWS account                                            |

## 4. Phase 1 acceptance

**Status (2026-09-26): met.** Each criterion below is covered by tests that were run:
`apps/api/test/integration/{auth,organizations,jobs,degradation,http}.test.ts` and
`tests/e2e/app.spec.ts`. Gaps and follow-ups are in the
[requirements matrix](requirements-matrix.md) and [TECH_DEBT](../TECH_DEBT.md).

- **Sign-up to dashboard.** A visitor goes from the website through sign-up, email verification
  (via the dev mailbox), login, organization setup and the dashboard. The journey is covered by
  e2e tests.
- **Refresh tokens.** Tokens rotate. A reused token revokes the session; a concurrent refresh
  gets a 409 with no revocation.
- **Account protection.** Accounts lock after repeated failures, rate limits return 429, and
  lookups cannot enumerate accounts.
- **Authorization.** Permissions come from the PRD matrix; a viewer cannot invite or change
  roles. The last owner cannot be removed or demoted.
- **Tenant isolation.** A user cannot read or change another organization's members,
  invitations or audit log, even by trying to switch into it.
- **Audit.** Security events (login, failed login, reset, session revoke, role change, invite)
  appear in the audit log.
- **Background email.** Emails are sent by background jobs; a provider failure retries with
  backoff and never fails the request.
