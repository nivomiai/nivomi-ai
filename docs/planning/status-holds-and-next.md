# Status, holds and next steps

The one-page answer to "where are we, what is waiting, and what comes next". Update it at the end
of every phase. The detailed trackers are:

- [implementation-plan.md](implementation-plan.md) — the phases;
- [requirements-matrix.md](requirements-matrix.md) — per-requirement status;
- [TECH_DEBT](../TECH_DEBT.md) — known gaps;
- [production-readiness-checklist](../operations/production-readiness-checklist.md) — the launch gate.

_Last updated: 2026-10-04._

## Phases

| #   | Phase                                | Status                                                                                       | Where                                        |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Platform foundation                  | ✅ Done                                                                                      | PR #8                                        |
| 2   | Contacts, leads, CSV/XLSX import     | ✅ Done                                                                                      | PR #9                                        |
| 3   | Compliance engine and campaigns      | ✅ Done — rules are a **draft pending counsel**; the dialer is simulated                     | `feature/compliance-campaigns` (PR after #9) |
| 4   | Calls and call history               | 🟡 4a done; 4b in progress — STT/TTS seams + VoiceSessionRunner + fakes landed; Exotel/Sarvam adapters deferred to adapter PRs when accounts open | `main` (session runner); adapter PRs TBD |
| 5   | Inbound calls                        | Not started                                                                                  | —                                            |
| 6   | Appointments                         | Not started                                                                                  | —                                            |
| 7   | CRM (HubSpot)                        | 🟡 Inbound done (connect, fetch contacts and leads); write-back and webhooks not started     | PR #9 (inbound)                              |
| 8   | Usage, quotas, billing               | Not started                                                                                  | —                                            |
| 9   | Notifications, OTP, Super Admin, MFA | Not started                                                                                  | —                                            |
| 10  | Analytics and observability          | Not started                                                                                  | —                                            |
| 11  | Deploy and hardening                 | Not started                                                                                  | —                                            |

PRs merge in order: **#7 → #8 → #9 → Phase 3**. Each branch builds on the one before.

Phase 3 details: [story spec](../stories/spec-phase-3-compliance-campaigns.md), [ADR-021](../decisions/ADR-021-compliance-rule-data-and-eligibility-decisions.md), the Phase 3 section of the [requirements matrix](requirements-matrix.md).

## On hold by owner decision (2026-09-27)

The owner decided to **hold these until every product phase is complete**, then set them up
together. Nothing here blocks building or testing: each one already has a development stand-in,
and production refuses to start without it (fail fast, never a silent fallback).

| Item                                                      | What it unblocks                                                                                                                                                                                   | Development stand-in today                                                                 | How to set it up later                              |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **HubSpot app** (developer account; client ID and secret) | Real "Connect HubSpot" for customers; testing against a real HubSpot account; later, write-back and webhooks (FR-87–FR-95)                                                                         | In-process fake HubSpot in the tests; the app shows "Connecting HubSpot is not enabled"    | [hubspot-setup.md](../operations/hubspot-setup.md)  |
| **AWS account** (ap-south-1)                              | **S3** storage for uploads and recordings; **KMS** envelope encryption for CRM tokens; **malware scanning** of uploads; **SES** email; **RDS** PostgreSQL; **ECS Fargate** hosting; **CloudWatch** | Local file storage, a static encryption key, the dev mailbox, embedded PostgreSQL (PGlite) | Phase 11, plus the adapter work listed in TECH_DEBT |

**Rule while on hold:** new code keeps depending on the provider interfaces (`StorageProvider`,
`EmailProvider`, `CRMProvider`, …) and ships with a development adapter or a fake, so turning on
the real service later is an adapter and configuration change, not a rewrite.

## Other external dependencies (not on hold — still needed)

These are not parked by the owner decision above, but the product cannot go live without them.
Work proceeds around them with fakes and fail-closed defaults.

| Dependency                                                                                                                | Needed for                                                        | Status                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Indian telecom and privacy **counsel** review of the India rule set (VQ-3, VQ-4, VQ-6)                                    | Marking ComplianceEngine rules final (built in Phase 3 as data)   | Not engaged. Rule set IN v1 is stored as `DRAFT`, shown as "pending legal review", and fails closed; approval means publishing an `APPROVED` version (ADR-021) |
| TRAI **Third Amendment** Gazette date (VQ-12)                                                                             | Effective dates of the 7-day inquiry window and A2P rules         | Waiting for notification. Dates are stored as rule data, updated when published                                                                                |
| **Exotel** account and written answers (VQ-1, VQ-7, VQ-8, VQ-13; OD-2)                                                    | Real calls, DLT and 140xx numbers, DND filtering, complaints feed | Not opened. Phase 3 uses a telecom-identity model plus a simulated dialer                                                                                      |
| **Sarvam** account and DPA (VQ-5, VQ-9)                                                                                   | Speech (Phase 4)                                                  | Not opened                                                                                                                                                     |
| **LLM provider** choice and evaluation                                                                                    | AI agent (Phase 4)                                                | Not started                                                                                                                                                    |
| **Razorpay** account; **pricing** (OD-4)                                                                                  | Billing (Phase 8)                                                 | Pricing not final                                                                                                                                              |
| **MSG91** account and DLT SMS template                                                                                    | Phone OTP (Phase 9)                                               | Not opened                                                                                                                                                     |
| Owner decisions **OD-1** (calendar), **OD-3** (consent evidence standard), **OD-5** (BFSI), **OD-6** (lead-ingestion API) | Various                                                           | Open. Safe defaults are applied and logged                                                                                                                     |

## Next

**Phase 4b — live voice.** Phase 4a (ADR-022) built the AI Agent layer: definitions, the
visual workflow builder, immutable versions pinned by campaigns and a conversation engine that
runs in browser test chat. The same engine drives live calls next. Phase 3 left these seams:

- **`VoiceProvider`** (`apps/api/src/campaigns/voice-provider.ts`): the Exotel adapter replaces
  `SimulatedVoiceProvider` and must implement `findCall(reference)` so crash reconciliation works
  (ADR-021 §5). Its status callback calls `CallOutcomeService.apply` with the attempt id.
- **`PreferenceRegistry`** (`apps/api/src/compliance/preference-registry.ts`): the real NCPR/DND
  lookup (VQ-8); keep "unavailable → DEFERRED".
- The decision's `obligations` (AI disclosure, recording notice) are passed to `placeCall`; the
  voice agent must speak them. Conversation outcomes (interested, callback requested, opted out)
  extend `CallOutcome` and the addendum §4 mapping in `campaign-policy.ts`.
- Still open for launch: counsel review of the rule set, the Third Amendment Gazette date
  (a rule set v2), Exotel written answers (VQ-1, VQ-7, VQ-8, VQ-13).

Try it locally: `npm run dev`, sign in as `admin@example.com` (password `nivomi-dev-admin`), open
**Campaigns → Site-visit follow-up (demo)**, run the pre-launch check and launch. Lotus Realty has
no telecom identity, so its campaigns show the "not verified" block.
