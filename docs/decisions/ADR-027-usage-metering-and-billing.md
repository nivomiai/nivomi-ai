# ADR-027: Usage metering, plans, quotas and Razorpay billing

- **Status:** Accepted
- **Date:** 2026-10-04
- **Builds on:** ADR-013 (Razorpay choice), ADR-017 (Nivomi domain authoritative), ADR-019
  (jobs and rate-limit stores)

## Context

Phases 4b/5 generate measurable usage (call minutes, STT audio seconds, TTS audio seconds, LLM
tokens, SMS). Phase 7 adds API-side CRM traffic. The MVP needs:

1. **Metering** — a record of every billable unit per tenant.
2. **Plans and quotas** — a configurable catalogue, enforced before expensive work starts.
3. **Billing** — invoices, Razorpay checkout, UPI subscriptions, GST.

Pricing (OD-4) and Razorpay account are both still open; the implementation must land against
a fake payment provider.

## Decision

### 1. Metering by event, not by poll

Every billable action emits a `usage_events` row inside the business transaction:

- `id`, `organization_id`, `occurred_at`, `period_year_month` (generated), `kind` (enum below),
  `quantity` (BIGINT), `unit` ('seconds' | 'tokens' | 'calls' | 'sms' | 'imports'), `source_id`
  (the entity: call_session_id, import_id, …), `metadata_jsonb`.

Kinds (Phase 8 starts with these; extend later):
`CALL_MINUTES_OUTBOUND`, `CALL_MINUTES_INBOUND`, `STT_AUDIO_SECONDS`, `TTS_AUDIO_SECONDS`,
`LLM_INPUT_TOKENS`, `LLM_OUTPUT_TOKENS`, `SMS_SENT`, `IMPORT_ROWS`, `CRM_API_CALLS`.

Indexes: `(organization_id, period_year_month, kind)`, `(organization_id, occurred_at)`.

### 2. Plan catalogue in Super Admin, not source

- `plans` (platform-owned): `code`, `name`, `monthly_cents_inr`, `currency` ('INR'), `limits_jsonb`
  (`{callMinutesOutbound: 1200, llmTokens: 500000, …}`), `overage_rates_jsonb`, `status`
  ('ACTIVE' | 'ARCHIVED'), `effective_from`.
- `organization_plans` (tenant-owned): `organization_id`, `plan_id`, `starts_on`, `ends_on`,
  `billing_cycle` ('MONTHLY' | 'YEARLY'), `status` ('ACTIVE' | 'CANCELLED' | 'PAUSED').
- Edited in `/platform/plans` (Super Admin); customers see their plan read-only.

### 3. Quota enforcement — fail-closed before expensive work

A new `QuotaService.check(organizationId, kind, quantity): 'ALLOWED' | 'OVER_QUOTA'` reads the
current period's `usage_events` sum against the plan limit. Callers:

- **Campaign pre-launch** (ADR-021) — refuses to launch when projected minutes exceed the
  remaining quota by more than 10 %.
- **Per-dial check** — the campaign runner stops dialing when the hard-cap is hit; a soft 90 %
  cap sends a warning email (Phase 9).
- **Import start** — large files refused when past `IMPORT_ROWS` cap.
- **Agent tool `appointment.book`** — not quota-gated (lightweight).

Over-quota triggers the DEFERRED result on eligibility (reason `OVER_QUOTA`) rather than
BLOCKED, so the campaign resumes next cycle automatically.

### 4. `PaymentProvider` seam

```ts
interface PaymentProvider {
  createCheckout(
    request: CheckoutRequest,
  ): Promise<{ redirectUrl: string; providerSessionId: string }>;
  verifyWebhook(headers, raw): PaymentEvent;
  createSubscription(request): Promise<{ subscriptionId }>;
  cancelSubscription(id): Promise<void>;
  issueRefund(paymentId, amountCents, reason): Promise<{ refundId }>;
}
```

`RazorpayPaymentProvider` is the production adapter; `SimulatedPaymentProvider` is a dev stand-in
that auto-"pays" on checkout. Refused in production (ADR-006 fail-fast) unless Razorpay keys
are configured.

### 5. Invoices and GST

- `invoices` (tenant-owned): `period_year_month`, `line_items_jsonb` (plan fee + per-unit
  overages), `subtotal_paise`, `cgst_paise`, `sgst_paise`, `igst_paise`, `total_paise`,
  `currency` ('INR'), `status` ('DRAFT' | 'ISSUED' | 'PAID' | 'VOID'), `issued_at`, `paid_at`,
  `pdf_s3_key`.
- A nightly job runs after month-end: rolls up `usage_events` by `(organization_id,
period_year_month, kind)`, applies the plan limits + overage rates, produces an invoice PDF
  (deferred: PDF rendering lives behind an existing/new seam; Phase 10 observability feeds the
  template).

### 6. Webhooks

`POST /api/v1/webhooks/razorpay` verifies the signature, matches the event to an invoice via
`providerSessionId`, and transitions `invoices.status` idempotently.

## Consequences

- Every expensive action is metered or quota-checked; the campaign engine already consumes
  `OVER_QUOTA` as DEFERRED, so adding the gate is additive.
- The platform can run on `SimulatedPaymentProvider` end-to-end for the hold period; the
  Razorpay switch is adapter + Super Admin config.
- Deferred: multi-currency, prorated downgrades, invoice line-item PDF rendering, dispute flows.
