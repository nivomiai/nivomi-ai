# ADR-021: Compliance rule data, the eligibility decision record and campaign execution

- **Status:** Accepted
- **Date:** 2026-09-27
- **Builds on:** ADR-014 (ComplianceEngine), ADR-017 (one ingestion path), ADR-019 (jobs),
  ADR-020 (lead data model)

## Context

ADR-014 requires every regulatory rule to be versioned, per-jurisdiction **data** evaluated by a
`ComplianceEngine`, and every eligibility decision to be recorded. Phase 3 (see the
[story spec](../stories/spec-phase-3-compliance-campaigns.md)) builds that engine, the eligibility
gate, telecom identity and campaigns. Counsel has not reviewed the India rules, the TRAI Third
Amendment has no Gazette date yet, and no telephony account exists. This ADR fixes how rules are
stored and versioned, what a decision record holds, and how campaigns dial without ever
double-dialling.

## Decision

### 1. Rule sets are immutable, versioned rows

- Table `compliance_rule_sets` (platform-owned, no `organization_id`): `jurisdiction`, `version`,
  `status` (`DRAFT`, `APPROVED`, `RETIRED`), `effective_from`, `effective_to`, `rules` (JSON),
  `sources` (JSON), `review_note`, `checksum`. Unique on `(jurisdiction, version)`.
- The **built-in** versions live in a typed data file
  (`apps/api/src/compliance/rule-sets/india-v1.ts`) validated by a zod schema. At startup the
  `RuleSetRegistry` inserts any missing version and **refuses to start** if a stored version's
  checksum differs from the file: a published version is never edited. A change is a new version
  with its own effective date, reviewed in a PR (and, later, created by a Super Admin in the
  database — the file is only the bootstrap).
- The active rule set for a jurisdiction at time _t_ is the highest version with
  `effective_from ≤ t < effective_to`. A `RETIRED` version is never selected. `DRAFT` versions are
  selected (nothing is `APPROVED` until counsel signs off) and the UI labels them "pending legal
  review".
- The rules JSON (schema version 1) contains, each with its `basis` (source ids) and
  `confidence`:
  - `timezone`, `phoneCountryCodes` (jurisdiction resolution from the recipient's number);
  - `callCategories` → `PROMOTIONAL`, `SERVICE`, `TRANSACTIONAL`, each with allowed number series
    (by sector), a calling window (or none) and allowed consent bases;
  - `numberSeries` → prefix of the national number (`140`, `1601`, `1600`) → series id; anything
    else is `UNKNOWN_NUMBER_SERIES` (ordinary numbers are blocked for commercial calls, CR-2);
  - `consentBases` → validity (`INQUIRY` 7 days, `APPLICATION` 90 days, others open-ended),
    whether an evidence timestamp and an operator reference are required, and whether the basis
    overrides a DND preference (only `REGISTERED_CONSENT`; the inquiry window does **not**, until
    counsel confirms — VQ-4);
  - `preferences` → which registry states block which categories, the sector → NCPR category map,
    and the result when the registry is unavailable (`DEFERRED`);
  - `optOut.reConsentBlockDays` (90), `complaints` (2 in 10 days; trip on any operator flag),
    `disclosures` (AI disclosure and recording notice required), `telecomIdentity`
    (verification and A2P declaration required; self-certification valid 365 days),
    `sectorOverlays` (BFSI: 1600xx for service, and REQUIRES_REVIEW until OD-5 is decided),
    `dpdp.consentRequiredFrom` (`2027-05-13`, a planning date).
- Organizations may only **tighten** rules: a campaign window wider than the rule window is
  rejected, and retry limits may only be lower than the defaults.

### 2. The engine is a pure function

`ComplianceEngine.evaluate(input, ruleSet)` takes an explicit input snapshot and returns
`{ result, reasons[], jurisdiction, nextEligibleAt }`. It performs no I/O, so every rule has a unit
test. It evaluates **all** checks and combines them with the precedence
`BLOCKED > REQUIRES_REVIEW > DEFERRED > ELIGIBLE`. Each reason is a machine-readable code with its
own result (e.g. `NO_CONSENT_BASIS`/BLOCKED, `OUTSIDE_CALLING_HOURS`/DEFERRED,
`UNKNOWN_JURISDICTION`/REQUIRES_REVIEW). The full list is in `compliance/reasons.ts` and
[API.md](../API.md).

The `EligibilityService` gathers the inputs (organization state and calling controls, telecom
identity, caller number, campaign policy, lead status, both consent ledgers, suppression, the
preference registry, attempts and live calls), calls the engine and writes the decision.

### 3. Every decision is recorded

Table `eligibility_decisions` (append-only; a trigger rejects `UPDATE`): `organization_id`,
`lead_id`, `campaign_id` (nullable), `purpose` (`PRE_LAUNCH`, `DIAL`), `result`, `reasons`,
`rule_set_id`, `rule_set_version`, `jurisdiction`, `inputs` (the exact snapshot given to the
engine, with the phone number masked to its last four digits), `evaluated_at`. A call attempt
references the ELIGIBLE decision that allowed it. Decisions appear on the lead timeline.
REQUIRES_REVIEW decisions open an `eligibility_reviews` item (one open per campaign and lead).

### 4. Two consent ledgers

`telecom_consent_entries` and `dpdp_consent_entries` are separate, append-only ledgers
(`GRANT` or `REVOCATION`, basis or purpose, evidence, validity, source, actor, unique
`event_key`). A telecom revocation never revokes DPDP consent and vice versa. Migration `0002`
back-fills a telecom `GRANT` for every lead that already has a consent basis. The ingestion engine
writes a ledger entry whenever it sets a basis, and `leads.consent_basis` remains a projection
written in the same transaction (it is what lists and filters read). Eligibility reads the ledger.

### 5. Campaign execution without double dialling

- `campaign_leads` holds each lead's run state (`PENDING`, `QUEUED`, `IN_CALL`, `WAITING`,
  `BLOCKED`, `REVIEW`, `EXCLUDED`, `DONE`), attempts made and `next_attempt_at`.
- A **tick** job per running campaign enrolls (continuous), applies pacing, and enqueues dial jobs
  for due leads (`FOR UPDATE SKIP LOCKED`), in one transaction with the state change to `QUEUED`.
  A `run_token` on the campaign guarantees one tick chain: launch and resume issue a new token and
  a tick carrying an old token stops.
- A **dial** job re-evaluates eligibility (`DIAL`), and only on ELIGIBLE inserts the
  `call_attempts` row (unique `(campaign_id, lead_id, attempt_number)`) with `dial_requested_at`,
  committing **before** calling `VoiceProvider.placeCall`. A retried dial job that finds its
  attempt already committed never dials again; it reconciles with
  `VoiceProvider.findCall(attemptId)` or closes the attempt as `PROVIDER_ERROR`. The campaign tick
  does the same for any attempt left unconfirmed for more than five minutes. At most one provider
  call per attempt.
- Each pre-launch check has its own id, so a newer check supersedes an older one even when both
  are requested at the same instant. Open REQUIRES_REVIEW items keep a static campaign open, so a
  resolved lead is still called by it.
- Outcomes arrive asynchronously (a provider callback; for the simulated dialer, a job) and are
  applied once: only an attempt still `DIALING` changes.
- The organization's calling controls (`organization_calling_controls`: Emergency Stop, complaint
  breaker, default jurisdiction and time zone) are inputs to every decision, so a stop takes
  effect at the next dial even before campaigns are paused.

### 6. Development stand-ins

`VoiceProvider` and `PreferenceRegistry` are interfaces. The simulated implementations are the
only ones in Phase 3; `VOICE_PROVIDER=simulated` and `PREFERENCE_REGISTRY=simulated` are
rejected in production, so production cannot start until real adapters exist (Phase 4).

## Alternatives considered

- **Rules as SQL data migrations only.** Immutable and reviewed, but untyped JSON inside SQL and
  duplicated in tests. The typed file plus checksum gives the same immutability with validation.
- **Rules as code (a strategy class per jurisdiction).** Rejected by ADR-014: a rule change would be
  a code change and could not be versioned per decision.
- **Stop at the first failing check.** Cheaper, but the pre-launch check could not show blocks by
  reason, and the decision record would hide further problems.
- **Audit-log entries instead of a decision table.** The audit log is for people's actions; at one
  decision per dial it would drown them, and decisions need typed columns for the timeline.

## Consequences

- Changing a rule is a new version with a PR review; old decisions keep pointing to the version
  they used.
- Until counsel review (VQ-3, VQ-4, VQ-6) every rule set is `DRAFT`, shown as pending legal
  review; production launch (Phase B) requires an `APPROVED` version (production-readiness gate).
- `eligibility_decisions` is the fastest-growing table; partitioning and retention are tracked in
  TECH_DEBT.
- Phase 4 replaces the simulated dialer with the Exotel adapter behind the same interface, and
  must implement `findCall` by client reference for crash reconciliation.
