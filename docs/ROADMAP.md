# Roadmap

Delivery follows BMAD phases. Each step names the BMAD skill that produces it.

## Phase 0: Foundation ✅ (2026-09-23)

Monorepo, API/web skeletons, env validation, logging/correlation, security baseline, tests, CI,
BMAD installation, engineering rules (`CLAUDE.md`).

## Phase 1: Planning (next)

1. ✅ Launch decisions resolved (2026-09-25): India, Exotel, Sarvam, HubSpot, Razorpay, AWS
   ap-south-1 (ADR-009 to ADR-014). Clerk was later replaced by Nivomi-owned auth (ADR-018).
2. India compliance research (`bmad-deep-recon`): TRAI/TCCCPR/DLT, DND, DPDP Act, recording;
   feeds ADR-014 and the PRD.
3. `bmad-prd`: PRD for the MVP journey with measurable acceptance criteria → `docs/planning/prd.md`.
4. `bmad-ux`: key flows and design tokens for the org app and Super Admin.
5. `bmad-architecture`: data model, tenancy enforcement, queues/outbox, voice runtime; accept
   ADR-008 (data access).
6. LLM evaluation plan for Indic-language sales calls (default model for `LLMRouter`).
7. `bmad-create-epics-and-stories` → `bmad-sprint-planning`.

## Phase 2: Platform core (expected epics, to be confirmed by the PRD)

- ✅ Data foundation: PostgreSQL (Drizzle, migrations; PGlite locally), readiness check.
- ✅ Identity and tenancy: Nivomi-owned auth (ADR-018), organizations, memberships, invitations,
  RBAC, tenant-isolation tests, audit log, rate limiting, job queue (ADR-019).
- Web app shell: ✅ sign-up/sign-in/verification/recovery, onboarding, team, security, audit log.
- Super Admin basics: organizations, users, plans/limits, provider configuration, feature flags.
- Customer model, status engine and CSV/Excel import pipeline (async).
- AWS infrastructure as code and CI deploy stage.

## Phase 3: MVP journey

Lead → AI outbound call → qualification → appointment → human handoff → transcript → AI summary →
usage → analytics. Covers the eligibility + ComplianceEngine (India rules), voice runtime
(Exotel + Sarvam streaming, LLMRouter, barge-in, fallback), AI tool registry, usage metering and
Razorpay subscription billing, and MVP analytics. External CRM integrations (HubSpot and others)
are NOT IN MVP (owner decision 2026-10-06) — the primary lead paths are CSV/XLSX upload, manual
entry, and `POST /leads`.

## Later

Additional CRMs, telephony and speech providers, advanced workflows and analytics, other
jurisdictions, SSO, multi-region. See the product brief's MVP boundary.
