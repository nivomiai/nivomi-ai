# Roadmap

Delivery follows BMAD phases. Each step names the BMAD skill that produces it.

## Phase 0: Foundation ✅ (2026-09-23)

Monorepo, API/web skeletons, env validation, logging/correlation, security baseline, tests, CI,
BMAD installation, engineering rules (`CLAUDE.md`).

## Phase 1: Planning (next)

1. Resolve the open questions in [planning/product-brief.md](planning/product-brief.md)
   (markets/jurisdictions, first providers, auth approach, hosting).
2. `bmad-prd`: PRD with MVP scope and measurable acceptance criteria → `docs/planning/prd.md`.
3. `bmad-ux`: key flows and design tokens for the org app and Super Admin.
4. `bmad-architecture`: data model, tenancy enforcement, auth, queues/outbox, provider interfaces;
   accept ADR-008 (data access).
5. `bmad-create-epics-and-stories` → `bmad-sprint-planning`.

## Phase 2: Platform core (expected first epics, to be confirmed by the PRD)

- Data foundation: PostgreSQL + migrations, Docker Compose for local PG/Redis, readiness check.
- Identity and tenancy: organizations, memberships, RBAC, tenant-isolation test suite, audit log.
- Super Admin basics: organizations, users, plans/limits, feature flags.
- Customer model, status engine and CSV/Excel import pipeline (async).

## Phase 3: Voice MVP

Provider interfaces + first adapters (LLM, STT, TTS, telephony), AI tool registry, eligibility
engine, a single outbound campaign flow end to end, usage metering.

## Later

CRM integration, workflows, billing, analytics, additional providers. Items deferred beyond MVP
are listed in the product brief.
