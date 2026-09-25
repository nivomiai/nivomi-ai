# ADR-014: Jurisdiction-aware ComplianceEngine, India first

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

Outbound AI calling is regulated: who may be called, when, with what consent, from which number
types, whether calls may be recorded, and how long personal data may be kept. Nivomi launches in
India and must be able to add jurisdictions without rewriting campaign logic.

## Decision

- A **`ComplianceEngine`** module owns all regulatory rules. Rules are **versioned, per-jurisdiction
  configuration data**, not conditionals in campaign or voice code. It covers calling hours,
  consent requirements, DND/opt-out, recording, privacy notices and data retention.
- The **eligibility engine** (the mandatory gate before any outbound contact) calls the
  ComplianceEngine alongside campaign rules, customer status, retry/cooldown and budget. It returns
  `ELIGIBLE`, `BLOCKED`, `DEFERRED` or `REQUIRES_REVIEW` with machine-readable reasons.
- Every decision is recorded (customer, rule-set version, inputs, result, reasons) for audit.
- The customer's jurisdiction and local time are resolved from their data (phone number, address)
  with an explicit organization default. When they cannot be resolved, the result is
  `REQUIRES_REVIEW`, never "allow".
- Opt-outs captured during a call (e.g. "don't call me again") are applied immediately through the
  status engine and honored by every later eligibility check.
- India is the first rule set. Its contents come from verified regulator sources (product-brief
  compliance items), reviewed before launch.

## Consequences

- Fail-closed: missing configuration or an unreachable DND source blocks or defers calls; it
  never permits them.
- Rule changes are data migrations with review and audit, not code deploys.
- Organizations may tighten rules (e.g. narrower calling hours) but never relax jurisdiction rules.
