# ADR-013: Nivomi-owned billing domain with Razorpay

- **Status:** Accepted (pricing tiers pending)
- **Date:** 2026-09-25

## Decision

- Nivomi owns the billing domain: plans, subscriptions, included usage, metered usage, overage,
  invoices and entitlements. **Razorpay** is the initial payment provider, behind `PaymentProvider`.
- **Model:** subscription + included usage + metered overage.
- **Usage is computed server-side only**, from metered events emitted by the systems that incur
  cost (call minutes, telephony, STT, TTS, LLM tokens, recordings, CRM operations, workflow runs).
  Usage records are append-only and idempotent (keyed by the source event).
- Entitlements and limits are enforced by Nivomi (including budget checks in eligibility), not
  inferred from payment status alone.
- Razorpay webhooks are signature-verified, idempotent and reconciled against Nivomi's records.

## Consequences

- Plans, tiers, included usage and overage rates are data (Super Admin), not code. Their values
  are set during PRD/business-model work.
- Changing billing semantics later requires explicit approval (CLAUDE.md "Ask before").
- Razorpay subscription, invoicing and GST-related capabilities must be confirmed against its
  current official documentation before the billing epic.
