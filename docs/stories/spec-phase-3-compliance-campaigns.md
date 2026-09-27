---
title: 'Phase 3: ComplianceEngine, eligibility, telecom identity and campaigns (simulated dialer)'
type: 'feature'
created: '2026-09-27'
status: 'done'
route: 'build'
baseline_commit: '5f5489cf3ade2a496ada1a04daa4648c26db8b91'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/planning/handoffs/phase-3-kickoff.md'
  - '{project-root}/docs/decisions/ADR-014-compliance-engine.md'
  - '{project-root}/docs/decisions/ADR-021-compliance-rule-data-and-eligibility-decisions.md'
---

## Intent

**Problem.** Nivomi holds leads (Phase 2) but cannot contact anyone. Before the real voice pipeline
(Phase 4) is connected, the platform needs the gate every call must pass, the tenant's telecom
identity, and campaigns that run durably, so that Phase 4 only swaps the dialer.

**Approach.** Build, per the [Phase 3 handoff](../planning/handoffs/phase-3-kickoff.md):

1. a **ComplianceEngine** that evaluates versioned rule data (India rule set v1, `DRAFT`, pending
   counsel) and fails closed;
2. an **eligibility engine** that gathers inputs, asks the ComplianceEngine, and **records every
   decision** with the rule-set version and an input snapshot, plus a REQUIRES_REVIEW queue;
3. **two append-only consent ledgers** (telecom, DPDP) with independent revocation;
4. **telecom identity and caller numbers** with the `UNVERIFIED → PENDING_REVIEW → VERIFIED`
   state, blocking calls until verified;
5. **campaigns** (static or continuous) with a pre-launch check, lifecycle, job-driven execution,
   dial-time re-check, retries, one-call-per-lead, progress, budget and **Emergency Stop**;
6. a **simulated `VoiceProvider`** and a **simulated preference registry** (NCPR/DND), so campaigns
   run end to end with no telephony account;
7. web screens and tests; a seeded demo campaign.

The design of the rule data and the decision record is fixed in
[ADR-021](../decisions/ADR-021-compliance-rule-data-and-eligibility-decisions.md).

## Significant-feature questions (CLAUDE.md)

| Question                    | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data owner and tenant**   | Telecom identity, caller numbers, consent ledgers, campaigns, campaign leads, call attempts, eligibility decisions, reviews, complaint records and organization calling controls are **tenant-owned** and carry `organization_id`. Rule sets are **platform-owned** reference data (no tenant), read by every tenant, never written by one.                                                                                                                                                                                                                                                                                             |
| **Source of truth**         | Rule sets: the `compliance_rule_sets` table (immutable versions; the built-in India v1 is loaded from a typed data file whose checksum must match what is stored). Consent: the two ledgers; `leads.consent_basis` stays as a projection written in the same transaction. Campaign run state: `campaign_leads` and `call_attempts` in PostgreSQL, never in memory. The NCPR/DND status comes from the `PreferenceRegistry` provider at dial time and is never cached as "allowed".                                                                                                                                                      |
| **Authorization**           | Central permissions (PRD §8.1): `campaigns.read` (OWNER, ADMIN, MANAGER, ANALYST), `campaigns.manage` and `campaigns.emergency_stop` (OWNER, ADMIN, MANAGER), `compliance.read` (OWNER, ADMIN, MANAGER, ANALYST), `compliance.review` for REQUIRES_REVIEW and complaint records (OWNER, ADMIN), `telecom.read` (OWNER, ADMIN, MANAGER), `telecom.manage` (OWNER, ADMIN), `consent.manage` (OWNER, ADMIN, MANAGER). Tenant from the session only. Super Admin verification of telecom identity and clearing the complaint breaker use a new `@RequireSuperAdmin()` guard on a small `/platform/...` API (the Super Admin UI is Phase 9). |
| **Audit**                   | Every campaign action (create, update, check, launch, pause, resume, stop, cancel), Emergency Stop and release, telecom identity changes, submission, verification, caller numbers, consent ledger entries, complaint records, breaker trip/acknowledge/clear and review resolutions are audit events. Every eligibility decision is its own append-only record (not an audit event, to keep the audit log readable at volume).                                                                                                                                                                                                         |
| **Provider failure**        | Voice: a failed `placeCall` marks the attempt `PROVIDER_ERROR`, which is retried per the retry policy with a new attempt number and a fresh eligibility decision. Preference registry unavailable → `DEFERRED` (`PREFERENCE_REGISTRY_UNAVAILABLE`), never ELIGIBLE. No production adapter exists yet: production refuses to start with the simulated providers (fail fast).                                                                                                                                                                                                                                                             |
| **Duplicate delivery**      | Dial jobs are enqueued with the idempotency key `dial:{campaign}:{lead}:{attempt}`; `call_attempts` is unique on `(campaign_id, lead_id, attempt_number)`. A duplicate call-outcome event is a no-op (the attempt only moves out of `DIALING` once). Lead status changes from calls use `event_key = call:{attemptId}`. Consent ledger entries have a unique `event_key`.                                                                                                                                                                                                                                                               |
| **Worker crash**            | The attempt row is committed with `dial_requested_at` **before** the provider is called. A retried dial job that finds `dial_requested_at` set never calls `placeCall` again; it reconciles through `VoiceProvider.findCall(reference)` and, if the provider has no such call, closes the attempt as `PROVIDER_ERROR` so the retry policy schedules a new attempt. At most one provider call per attempt: no double dial. A crashed campaign tick is recovered by the job system's stale-lock retry; a `run_token` keeps exactly one tick chain per campaign.                                                                           |
| **DB outage**               | Every state change is transactional; jobs retry with backoff. Nothing dials without a committed ELIGIBLE decision and attempt row, so an outage stops dialling (fail closed) rather than dialling blind.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Usage and cost**          | Each attempt stores its duration; campaigns accumulate `used_seconds` against `budget_minutes` and auto-pause at the cap (`BUDGET_EXHAUSTED`). Organization usage caps and billing are Phase 8. The simulated dialer costs nothing.                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Behaviour at 100× scale** | Pre-launch checks and enrollment run in chunked, resumable jobs (500 leads per step). The tick selects due leads with `FOR UPDATE SKIP LOCKED` and a partial index on `(campaign_id, state, next_attempt_at)`. Pacing (concurrency, calls per hour) bounds dial jobs. `eligibility_decisions` grows with every dial and check; it is indexed by `(organization_id, lead_id, created_at)` and `(campaign_id, created_at)`, and is a candidate for monthly partitioning and the 2-year retention of the draft retention matrix (TECH_DEBT). Rule sets are cached in memory per version (immutable).                                       |

## Boundaries and constraints

**Always**

- No regulatory rule in campaign or voice code. Categories, number series, windows, consent-basis
  validity, DND overrides, the re-consent block, the complaint threshold, disclosures, sector
  overlays and the DPDP start date are **rule data** evaluated by `ComplianceEngine`.
- Fail closed: an unknown jurisdiction, category, number series, registration or consent basis is
  never ELIGIBLE. Missing rules → REQUIRES_REVIEW; transient failures → DEFERRED.
- Result precedence: BLOCKED > REQUIRES_REVIEW > DEFERRED > ELIGIBLE. All reasons are collected
  (not first-failure) so the pre-launch check can count blocks by reason. A review resolution only
  supplies inputs; the engine re-evaluates, so it can never override BLOCKED (FR-50).
- Every decision is recorded (lead, organization, campaign, purpose, rule-set id and version,
  jurisdiction, inputs snapshot, result, reasons, time). Decisions and ledger rows are append-only
  (a database trigger rejects `UPDATE`).
- The India rule set v1 is `status: DRAFT` with its sources, and the UI says "pending legal
  review" wherever rules are shown.
- Cross-tenant tests for the API, the job payloads (ids only; tenant re-read from the row) and
  the queue.

**Ask first**: nothing in scope needs it (no production data, no auth strategy or billing change).

**Never**: real telephony, a real NCPR lookup, HubSpot or AWS (held; see the status file).

## Design decisions and interpretations

- **Pre-launch check and "zero eligible" (FR-36).** The check runs at "now". A lead that is
  DEFERRED only for time (outside hours, cooldown, not started) will become callable, so launch
  requires at least one lead that is ELIGIBLE **or DEFERRED**. All-BLOCKED/REVIEW selections cannot
  launch. The check must be newer than the last edit to the campaign.
- **Static selection** is the set of leads matched by the latest pre-launch check (a snapshot).
  **Continuous** campaigns also enroll new matching leads on every tick (A-17).
- **Selection** is a filter (lead statuses, sources, consent present) or an explicit lead list.
  Import-batch selection and Agent Versions (FR-35) wait for later phases.
- **One caller number per campaign** for the MVP; rotating numbers raises operator-flag risk.
- **Calling window.** Effective window = rule window ∩ campaign window, in the recipient's local
  time (rule data gives the jurisdiction's time zone). Creating a campaign with a window wider
  than the rule allows is rejected by the ComplianceEngine.
- **Retries (FR-40).** Defaults 3 attempts, ≥ 4 h apart, ≤ 2 per lead per day (A-18); campaign
  settings may only tighten them. `NO_ANSWER`, `BUSY`, `FAILED`, `PROVIDER_ERROR` retry;
  `OPTED_OUT`, `NOT_INTERESTED`, `WRONG_NUMBER` never do. `CONNECTED` ends the lead's run.
- **One conversation (FR-41).** A per-lead advisory lock at dial time plus a check that no attempt
  for the lead is `DIALING` in any campaign; at most one connected call per lead per day across the
  organization (A-19) → `DEFERRED`.
- **Outcome → Lead Status** (addendum §4): no connection → `ATTEMPTED` (`UNREACHABLE` after the
  final attempt); connected → `CONNECTED`; `NOT_INTERESTED`; `OPTED_OUT` → `DO_NOT_CALL`;
  `WRONG_NUMBER` → `CLOSED`. A Member's change newer than the dial is never overwritten (FR-25).
- **In-call opt-out (FR-51)**: suppression (`IN_CALL_OPT_OUT`), `DO_NOT_CALL`, a telecom
  revocation ledger entry; the 90-day re-consent block is computed from that revocation.
- **Emergency Stop (FR-43)** sets an organization flag; RUNNING and SCHEDULED campaigns become
  PAUSED with reason `EMERGENCY_STOP`, and every dial re-checks the flag. Releasing the stop does
  not resume anything: each campaign is resumed explicitly. Live simulated calls are asked to end.
- **Complaint breaker (FR-49)**: rule data (2 complaints in 10 days, or any operator flag). Tripping
  pauses all running campaigns and the named caller number. Resuming needs an ADMIN
  acknowledgement **and** a Super Admin clear.
- **Telecom identity**: any edit to a VERIFIED identity or its numbers returns it to UNVERIFIED.
  Self-certification expiry comes from rule data (365 days); an expired identity is treated as
  EXPIRED at evaluation time. The 30-day warning email waits for notifications (Phase 9).
- **DPDP**: the DPDP ledger exists and is shown; the rule `dpdpConsentRequiredFrom` is
  `2027-05-13` (planning date), after which missing DPDP consent blocks. Tests move the clock.
- **Simulated preference registry**: a fixed list of fictitious numbers registered as fully
  blocked, plus a switch to simulate an outage in tests. **Simulated dialer**: deterministic
  outcomes from a hash of number and attempt, delivered asynchronously through a job (as a
  provider callback would be), overridable in tests.

## Acceptance (from the handoff's definition of done)

- Unit tests for every rule in the India rule set (engine is a pure function over rule data).
- Integration tests: eligibility and decision recording; review queue; campaigns lifecycle,
  pre-launch, launch, dial-time re-check, retries and cooldown, idempotent dialing and outcome
  replay, crash recovery (no double dial), Emergency Stop, complaint breaker, budget, telecom
  identity blocking, consent ledgers, and cross-tenant isolation (API, jobs, queue payloads).
- e2e: create and launch a campaign against the simulated dialer, seeing BLOCKED reasons.
- ADR-021, API docs, requirements matrix, status file and TECH_DEBT updated; seed has a demo
  campaign; `npm run verify` green; PR opened against `develop` (depends on #9).
