# Phase 3 handoff — Compliance engine and campaigns

Context for a fresh working session. Read this first, then [CLAUDE.md](../../../CLAUDE.md) (the
rules) and [status-holds-and-next.md](../status-holds-and-next.md) (what is done and what is held).

## 1. Where the code is

- **Git:** Phase 2 is on `feature/leads-crm` (PR #9). PRs merge in the order #7 → #8 → #9.
  Start Phase 3 on a new branch, `feature/compliance-campaigns`, **created from
  `feature/leads-crm`**, and open its PR against `develop` noting that it depends on #9. Never
  commit to `main` or `develop`.
- **Built so far:**
  - Nivomi-owned auth (ADR-018), organizations, RBAC (`apps/api/src/authorization/permissions.ts`,
    with the "own" scope for AGENT), the audit log, rate limiting, and the PostgreSQL job queue
    (ADR-019: per-handler timeouts, `PermanentJobError`).
  - Leads, contacts, suppression list and dedupe review; CSV/XLSX import; HubSpot inbound
    (ADR-020).
- **Where things live:**
  - The single ingestion path is `apps/api/src/leads/ingestion.ts` (`IngestionEngine`).
  - Consent is on `leads.consent_basis` / `consent_evidence`. Opt-outs are in
    `suppression_entries`. The Lead lifecycle and idempotent transitions are in
    `lead_status_changes`.
  - Modules: `PlatformModule` (global: audit, jobs, crypto, storage, email, rate limits),
    `LeadsModule`, `ImportsModule`, `CrmModule`. Add `ComplianceModule` and `CampaignsModule`
    the same way.
- **Web:** `apps/web/app/app/*` with the screens in `components/app/screens/*`.
  - Use the shared UI in `components/app/ui.tsx`, the data hooks `useResource` (with
    `pollWhile`) and `useSubmit`, and the API client in `lib/api/client.ts`.
  - Add navigation entries in `components/app/AppShell.tsx`.
- **Dev data:** `npm run dev` seeds users (password `nivomi-dev-admin`; `admin@example.com` is
  Super Admin) and 18 demo leads. Extend `apps/api/src/dev/seed.ts` / `seed-data.ts` with demo
  campaigns; local seeding needs no approval.

## 2. Machine and toolchain constraints (learned the hard way)

- **Memory:** about 1 GB of free RAM. Run builds and tests one at a time; API integration tests
  run with `fileParallelism: false`.
- **Stale servers:** before Playwright, check ports 3000 and 4000 (`netstat -ano`). A stale
  server gets reused silently. Identify its command line before stopping it.
- **Migrations:** **never regenerate an uncommitted migration while `npm run dev` is running.**
  It auto-migrates the local PGlite, and the draft then collides with the final version. The
  local database holds a hand-made account (`shankoyeri@gmail.com`), so never delete
  `apps/api/.data/pglite`.
- **Shell:** bash heredocs break on emoji and some Unicode. Write scripts and docs with the file
  tools. Prefix Playwright runs with `MSYS_NO_PATHCONV=1`. Use `127.0.0.1`, not `localhost`, for
  server-side calls.
- **`exactOptionalPropertyTypes` is on.** Optional input fields need `| undefined`. Never disable
  lint rules, never add `any`.

## 3. Phase 3 scope (PRD revision 3)

| Area                             | PRD                               | Build                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ComplianceEngine**             | FR-44–FR-52, ADR-014, research R1 | India rule set v1 as **versioned rule data with effective dates** (not code conditionals). Covers: call category (promotional, service, transactional); number series (140xx for promotional; 1601xx, or 1600xx for BFSI, for service); calling window 10:00–21:00 recipient-local; consent-basis rules (the 7-day inquiry window, 3 months for applications, does **not** override DND until counsel confirms); opt-out with a 90-day re-consent block; complaint breaker (pause well before 3 complaints in 10 days); AI and recording disclosure flags; sector overlays; **fail closed** on anything unknown |
| **Eligibility engine**           | FR-44–FR-48, FR-50                | The mandatory gate before any dial. Combines consent, suppression/DNC, lead status (`DO_NOT_CALL` blocks; `CONVERTED`/`CLOSED` excluded by default), calling hours in the recipient's local time, retries and cooldown, jurisdiction and budget. Returns **ELIGIBLE / BLOCKED / DEFERRED / REQUIRES_REVIEW** with machine-readable reasons (e.g. `NO_CONSENT_BASIS`, `SUPPRESSED`, `OUTSIDE_CALLING_HOURS`, `UNKNOWN_JURISDICTION`). **Every decision is recorded** with the rule-set version and inputs. There is a review queue for REQUIRES_REVIEW (OWNER/ADMIN resolve it, per the matrix)                  |
| **Two consent ledgers**          | FR-52, research R3                | A telecom ledger and a DPDP ledger with independent revocation and an append-only evidence store. The current `leads.consent_basis` becomes a view over, or a migration into, the ledgers                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Telecom identity and numbers** | FR-9–FR-13                        | Per-tenant DLT sender registration, telemarketer binding, 140xx/1601xx caller numbers, A2P declaration and expiry. Super Admin verification comes later (Phase 9), so model the state (`UNVERIFIED` → `VERIFIED`) and **block calling until verified**. No real telephony: Exotel is not connected                                                                                                                                                                                                                                                                                                              |
| **Campaigns**                    | FR-35–FR-43                       | Create (static list, or continuous from new leads); pre-launch check (FR-36); lifecycle (draft → scheduled → running → paused → completed); durable execution in jobs (FR-38); **re-check eligibility at dial time** (FR-39); retries with limits and cooldown (FR-40); one conversation per lead at a time (FR-41); progress (FR-42); **Emergency Stop** per organization (FR-43); pacing and budgets                                                                                                                                                                                                          |
| **Dialer**                       | —                                 | A **simulated `VoiceProvider`** for development and tests (outcomes such as answered, no-answer and busy), so campaigns run end to end without Exotel. The real adapter is Phase 4                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Web**                          | FR-131-style screens              | Campaigns list, create or edit, pre-launch check results, run view with progress, emergency stop; eligibility decision log per lead (timeline); the REQUIRES_REVIEW queue; telecom identity settings                                                                                                                                                                                                                                                                                                                                                                                                            |

Permissions (PRD §8.1): campaigns are create/start/pause for OWNER, ADMIN and MANAGER, read-only
for ANALYST; Emergency Stop for OWNER, ADMIN and MANAGER; resolving REQUIRES_REVIEW for OWNER and
ADMIN only. Add these to the central permission map; never check roles ad hoc.

## 4. Non-negotiables for this phase

- **No regulatory rule is hard-coded** in campaign or voice code. Everything goes through the
  `ComplianceEngine`, backed by rule data.
- **Fail closed:** an unknown jurisdiction, category, number series, registration or consent
  basis is never ELIGIBLE.
- **The India rules are drafts** until counsel reviews them. Mark the rule set `status: DRAFT`,
  record its sources (the research doc and TRAI instruments), and show "pending legal review"
  in the UI.
- **Every eligibility decision and campaign action is recorded and audited.** Cross-tenant tests
  cover the API, the jobs and the queue payloads.
- **Idempotency:** a dial attempt is keyed per campaign, lead and attempt number. Worker crashes
  must never double-dial.
- **Nothing new on hold:** the HubSpot app and AWS stay on hold (see the status file). Build
  against interfaces and fakes.

## 5. Before coding

1. Answer CLAUDE.md's "significant feature" questions in a short story spec under
   `docs/stories/`: data owner, source of truth, authZ and audit, provider failure, duplicate
   delivery, worker crash, DB outage, usage and cost, behaviour at 100× scale.
2. Write **ADR-021** (the rule-data model and eligibility decision record) before the migration.
3. Read the sources:
   - [ADR-014](../../decisions/ADR-014-compliance-engine.md);
   - research §8 R1–R4 in
     [research.md](../research/domain-india-ai-outbound-calling-compliance-2026-09-25/research.md);
   - PRD §8.2, §8.6, §8.7, §10 in [prd.md](../prds/prd-Nivomi-2026-09-26/prd.md).

## 6. Definition of done

`npm run verify` is green, covering:

- unit tests for every rule;
- integration tests for eligibility, campaigns, stop, retries, idempotency and tenant isolation;
- an e2e test of creating and launching a campaign against the simulated dialer and seeing
  BLOCKED reasons.

Also, before the phase counts as done:

- ADR-021, the API docs, the requirements matrix and the status file are updated;
- the seed has a demo campaign;
- the PR is opened.
