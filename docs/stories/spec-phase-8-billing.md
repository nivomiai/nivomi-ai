---
title: 'Phase 8: Usage metering, plan catalogue, quotas, and billing against a fake payment provider'
type: 'feature'
created: '2026-10-04'
status: 'proposed'
route: 'build'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/decisions/ADR-027-usage-metering-and-billing.md'
---

## Intent

**Problem.** Nothing meters the work the platform does, and there is no concept of a plan,
quota, invoice or payment. Phase 8 lays the full billing substrate behind a fake payment
provider so the Razorpay switch later is adapter work only.

**Approach.** Per ADR-027:

1. `usage_events` table + `UsageMeter.record(event)` called from the voice session runner (on
   `close`), import worker (chunk complete), CRM write-back worker (per API call), and SMS
   provider.
2. `plans` + `organization_plans` tables + Super Admin `/platform/plans` CRUD.
3. `QuotaService.check` wired into: campaign pre-launch, per-dial engine, import start.
4. `PaymentProvider` seam + `SimulatedPaymentProvider` + `RazorpayPaymentProvider` (deferred
   adapter PR).
5. `invoices` table + nightly rollup job + `POST /api/v1/webhooks/razorpay`.
6. Customer app: `/app/plan` (plan + usage bar), `/app/invoices` (list + PDF link).
7. Super Admin: `/platform/plans`, `/platform/organizations/:id/plan` (assign/change).

Out of scope: prorated downgrades, multi-currency, dispute flows, invoice PDF rendering engine
(a stub that produces a plain-text PDF for the hold period).

## Significant-feature questions (CLAUDE.md)

| Question                 | Answer                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data owner and tenant    | `usage_events`, `organization_plans`, `invoices` are tenant-owned (`organization_id`). `plans` is platform-owned (editable only by SUPER_ADMIN).                                         |
| Source of truth          | `usage_events` is append-only; the per-period rollup is a materialized derivation. `invoices` latches on `ISSUED`.                                                                       |
| Authorization and audit  | New permissions `billing.read` (all roles that already have `organization.read`) and `billing.manage` (OWNER, ADMIN). Plan changes audited; webhook signature verification required.     |
| Provider failure         | Razorpay webhook failures: event replayed on next retry. Checkout failures: user retries. A paid-but-never-webhooked payment is caught by the "unmatched payment" reconciliation report. |
| Duplicate delivery       | `usage_events` idempotency: unique on `(organization_id, kind, source_id)`. Webhook idempotency: unique on `provider_event_id`.                                                          |
| Worker crash / DB outage | Nightly rollup is idempotent on `(organization_id, period_year_month)`; crashed worker reruns are safe.                                                                                  |
| Usage and cost           | Metering is itself cheap: one row per billable event; the rollup is a GROUP BY, indexed.                                                                                                 |
| 100× scale               | 10 M events/month per large tenant. The index on `(organization_id, period_year_month, kind)` serves the rollup; TECH_DEBT: monthly partitioning when per-month row count exceeds 50 M.  |

## Acceptance

- Migration `0007_billing.sql`: `usage_events`, `plans`, `organization_plans`, `invoices`.
- `UsageMeter.record` + instrumentation points (voice runner, import worker, CRM worker,
  SMS provider). Unit tests for idempotency.
- `QuotaService.check` integration test from the campaign pre-launch and per-dial path:
  OVER_QUOTA → DEFERRED, not BLOCKED.
- `PaymentProvider` seam + `SimulatedPaymentProvider` + four integration tests (checkout,
  webhook, subscription create, refund).
- Nightly rollup job unit test.
- `/app/plan`, `/app/invoices`, `/platform/plans`, `/platform/organizations/:id/plan` pages.
- `npm run verify` green.

## Deferred to adapter PR

- `RazorpayPaymentProvider` once account + keys are provisioned.
- Final pricing (OD-4 — owner input needed).
- GST line-item PDF rendering (owner can start with the stub).
