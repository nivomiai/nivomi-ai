# Nivomi AI — Engineering Rules

This file is the single source of truth for how engineering work is done in this
repository. Product scope lives in [docs/planning/product-brief.md](docs/planning/product-brief.md);
architecture in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); decisions in [docs/decisions/](docs/decisions/).

Nivomi AI is a multi-tenant SaaS platform for AI voice agents (inbound/outbound calling),
customer/lead management, CRM integration, campaigns, workflows, usage metering and billing,
operated through a Super Admin control plane. Goal: a secure, observable, cost-controlled
platform that grows from MVP to enterprise **without a rewrite**. Optimize for "can this run as
a real production SaaS?", not for volume of code.

## Current state

Phase 1 platform foundation (2026-09, see `docs/planning/implementation-plan.md`): PostgreSQL via
Drizzle (`packages/database`; PGlite for dev/tests), Nivomi-owned auth (ADR-018), organizations,
memberships, invitations, RBAC, audit log, rate limiting, PostgreSQL job queue (ADR-019), dev
email mailbox. `apps/web` serves the **public website** plus the **customer app** (`/login`,
`/signup`, verification, recovery, `/invite`, `/app/*`: onboarding, overview, team, security,
audit log). Phase 2 (ADR-020): contacts, leads, suppression list, dedupe review queue, CSV/XLSX
import (signed uploads, mapping, preview, chunked jobs). HubSpot inbound was built behind the
`CRMProvider` seam, but **external CRM integrations are not in the MVP** (owner decision
2026-10-06) — the primary lead paths are CSV/XLSX upload, manual entry, and `POST /leads`; web `/app/leads`,
`/app/data-sources`. Phase 3 (ADR-021): `ComplianceEngine` over versioned rule data (India v1,
**DRAFT pending counsel**), eligibility engine with a recorded decision per check and dial, two
append-only consent ledgers, telecom identity and 140xx/1601xx caller numbers, campaigns with
pre-launch check, job-driven dialling, retries, Emergency Stop and complaint breaker, against a
**simulated** `VoiceProvider` and preference registry (refused in production); web `/app/campaigns`,
`/app/compliance`, `/app/telecom`. Phase 4a (ADR-022): AI Agents with a typed conversation workflow,
visual builder (React Flow), deterministic qualification, platform guardrails, immutable versions
pinned by campaigns, and browser test chat on a conversation engine with a **simulated** `LLMProvider`;
web `/app/agents`. Dograh is a feature reference only. Not built yet: real calls (Exotel), real external CRM adapters
(not in MVP), billing (Razorpay), Super Admin UI (a few `/platform` APIs exist), MFA enforcement,
SES/MSG91/S3 adapters. Requirement status: `docs/planning/requirements-matrix.md`. Holds (AWS account — parked
until the deploy phase) and next steps: `docs/planning/status-holds-and-next.md`.

## Platform decisions (accepted — see ADRs before touching these areas)

India first, jurisdiction rules as data in a `ComplianceEngine` (ADR-014) · languages en, hi, ml,
ta, te, kn · Exotel telephony via `VoiceProvider`, Sarvam streaming STT/TTS, LLM via
`LLMProvider`/`LLMRouter`, barge-in + fallback, < 1.5–2 s turn-latency target (ADR-011) · `CRMProvider`
seam remains for future generic external-CRM connectors but **no CRM is in the MVP** (ADR-012 kept
as history; owner decision 2026-10-06), Nivomi DB authoritative · every
source (Excel/CSV, CRM, manual, inbound) converges on the Nivomi Contact/Lead domain; campaigns never
touch CRM objects (ADR-017) · Razorpay via
`PaymentProvider`, Nivomi-owned billing (ADR-013) · Nivomi-owned authentication (JWT + rotating
refresh tokens, Argon2id, HttpOnly cookies; ADR-018, supersedes Clerk/ADR-009) and authZ · jobs on
PostgreSQL, rate limits behind `RateLimitStore` (ADR-019) · AWS ap-south-1 on ECS Fargate, RDS, ElastiCache, S3 (ADR-010) · SES email
via `EmailProvider`, MSG91 OTP via `OtpProvider` (ADR-015) · OpenTelemetry → Grafana Cloud (India
region), CloudWatch for AWS infrastructure (ADR-016). Inbound calls and human escalation are MVP
capabilities (PRD revision 2). Vendor specifics
must come from current official docs, never memory.

## Commands (npm workspaces — do not use pnpm/yarn)

| Command                    | Purpose                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| `npm run verify`           | **Quality gate**: format → lint → typecheck → test → build → audit → e2e |
| `npm run dev`              | API on :4000 and web on :3000 (API needs `apps/api/.env.local`)          |
| `npm run test:unit`        | Vitest, colocated `src/**/*.test.ts`                                     |
| `npm run test:integration` | Vitest, `apps/*/test/**` (boots the real app via `createApp`)            |
| `npm run test:e2e`         | Playwright against production builds (run `npm run build` first)         |
| `npm run lint` / `format`  | ESLint (type-aware, zero warnings) / Prettier                            |
| `npm run typecheck`        | `tsc --noEmit` for every workspace + root                                |

Target a single workspace with `-w @nivomi/api`, `-w @nivomi/web`, `-w @nivomi/config`.

## Repository layout

```
apps/api        NestJS 12 HTTP API (ESM). Modular monolith: one Nest module per domain.
apps/web        Next.js 16 App Router + Tailwind 4.
packages/config Env loading + zod validation shared by every deployable.
tests/e2e       Playwright smoke tests across apps.
docs/           Engineering docs, ADRs; BMAD artifacts in docs/planning and docs/stories.
_bmad/, .claude/skills/bmad-*   Vendored BMAD Method install — do not hand-edit (see below).
```

Planned boundaries (create only when a story needs them): `workers/*` (campaign, voice,
workflow, integration) and `packages/*` per domain (database, auth, ai, voice, crm, billing,
events, queue, storage, observability, providers). Never create empty packages speculatively.

## Toolchain constraints (verified — do not "upgrade" past these blindly)

- **TypeScript 6.0.x**, not 7: typescript-eslint supports `<6.1`.
- **ESLint 9**: ESLint 10 needs Node ≥ 22.13; local Node is 22.12. Upgrade Node first (TECH_DEBT).
- **NestJS 12 is ESM-only**: relative imports need `.js` extensions; API builds with plain `tsc`
  (the Nest CLI crashes on Node 22.12). Vitest uses SWC because esbuild cannot emit decorator
  metadata. Constructor-injected classes must be **value** imports (not `import type`).
- Workspace packages export a `@nivomi/source` condition → typecheck/tests read TS source; builds
  and runtime read `dist/`. Root `build` builds `packages/*` before `apps/*`.

## BMAD is the development method

Significant work flows through BMAD skills (installed in `.claude/skills/`, v6.12.0):
`bmad-help` (where am I / what next) → `bmad-product-brief` → `bmad-prd` → `bmad-ux` →
`bmad-architecture` → `bmad-create-epics-and-stories` → `bmad-sprint-planning` →
`bmad-build` / `bmad-agent-dev` per story → `bmad-code-review` → `bmad-retrospective`.
Planning artifacts go to `docs/planning/`, stories/sprints to `docs/stories/`.

- `uv` is not installed. BMAD skills say `uv run <script>`; the scripts are stdlib-only, so run
  them with `python <script>` instead until `uv` is installed.
- Reconfigure BMAD only by re-running `npx bmad-method install`; team overrides go in
  `_bmad/custom/config.toml`.
- Small fixes (typos, lint, obvious bugs) do not need a story. Anything touching data model,
  tenancy, auth, billing, providers or a user-visible flow does.

For every significant feature answer **before** implementing: who owns the data and which tenant;
source of truth; how it is authorized and audited; what happens on provider failure, duplicate
delivery, worker crash, DB outage; how usage/cost is measured; behavior at 100× scale.

## Non-negotiable engineering rules

**Tenancy.** Every tenant-owned row carries `organization_id`. Resolve tenant context from the
authenticated membership — never from client-supplied IDs. Enforce isolation in API, service,
repository, queue payloads, workers, files, AI tools, exports, webhooks. Every data-touching story
ships cross-tenant access tests.

**AuthZ.** Nivomi authenticates (ADR-018) and decides permissions. Centralized policies (RBAC:
OWNER, ADMIN, MANAGER, AGENT, ANALYST, VIEWER in `authorization/permissions.ts`; platform
SUPER_ADMIN granted only in Nivomi's DB), declared per endpoint with `@RequirePermission`, never
ad-hoc checks in controllers/components. Tenant endpoints act on the session's active
organization (`/organizations/current/...`). Super Admin actions are always audited; no hidden
bypasses.

**Config & secrets.** All config goes through `@nivomi/config` (`parseEnv` + zod). Services inject
`API_ENV`, never read `process.env`. No fallback secrets; production fails fast. Only
`.env.example` is committed. Provider credentials stored by the app are encrypted at rest, masked,
never returned or logged. Operational settings (providers, models, limits, plans, flags, prompts)
belong in DB/Super Admin, not source code.

**Providers.** Business logic depends on interfaces (`LLMProvider`, `VoiceProvider`,
`STTProvider`, `TTSProvider`, `CRMProvider`, `PaymentProvider`, `StorageProvider`, `CalendarProvider`,
`EmailProvider`, `OtpProvider`, `FileImportProvider`); vendor code
lives in adapters. Use official docs for every integration — never guess an API.

**AI tools.** Explicitly registered with schema, authorization, tenant scope, allowed roles,
audit flag, timeout, retry, rate limit, side-effect definition. Never give the model raw SQL,
filesystem, code execution or arbitrary HTTP. Meter tokens/cost per call; guard against loops.

**Outbound communication** always passes the eligibility engine (consent, DNC, status, hours,
retries, cooldown, jurisdiction, budget → ELIGIBLE / BLOCKED / DEFERRED / REQUIRES_REVIEW), which
delegates regulatory rules to the `ComplianceEngine`. Fail closed: unknown jurisdiction or missing
rules never allow a call. No regulatory rule is hard-coded in campaign or voice code.

**Async & events.** Campaigns, imports, exports, CRM sync, AI post-processing run in queues —
never in an HTTP request. Jobs have identity, idempotency, timeout, backoff, dead-letter. Events
via outbox; assume at-least-once, make consumers idempotent. External CRM failure never fails the
business event.

**Database (PostgreSQL).** Migrations only; constraints, FKs, indexes for real query patterns;
transactions; audit records. Never auto-run destructive operations (DROP/DELETE/reset) against
production — stop and ask.

**API.** Versioned `/api/v1/...`; validated input; paginated lists; idempotency keys for
side-effecting POSTs; errors use the envelope in docs/API.md with `requestId`. Never expose DB
models directly. Webhooks: signature verification, replay protection, idempotency.

**Observability.** Structured pino logs with request/correlation, tenant, job and provider IDs.
Add new credential-bearing fields to `REDACTED_PATHS`. Never log secrets, tokens or unnecessary PII.

**Frontend.** UI → hooks/state → API client. No business rules in components. Reuse the design
system tokens (`apps/web/app/globals.css`); no generic "AI dashboard" UI.

**Scope.** MVP first. Design extension points, implement only approved scope. No microservices,
Kubernetes or speculative abstractions.

## Quality gate & failure handling

Run `npm run verify` before declaring meaningful work complete. If a check fails, fix the root
cause and re-run. Never delete/skip tests, disable lint rules, add `any`, comment out code or
suppress errors to get green. Remove debug code, `console.log`, dead code and unused deps.
Justify every new dependency (purpose, alternatives, security) in the PR or an ADR.

**Never claim** tests passed, a build succeeded, browser verification happened or an integration
works unless it was actually run. Report real status, including what was skipped.

## Git

`main` (production) ← `develop` (integration) ← `feature/*`, `bugfix/*` (also `chore/*`, `docs/*`);
`hotfix/*` branches from `main` and merges back into both. Never commit directly to `main` or
`develop` — every change lands by PR. Full workflow and branch protection: [CONTRIBUTING.md](CONTRIBUTING.md).
Conventional commits (`feat(scope): …`, `fix(…)`, `test(…)`, `docs(…)`, `chore(…)`). Never commit
`.env*` (except `.env.example`), keys, credentials, customer data or exports. Don't rewrite
history.

## Ask before

Destructive production/data changes · deleting functionality · irreversible infrastructure ·
fundamental architecture changes · auth strategy changes · billing semantics · credential
rotation. Routine engineering (fixing lint/types/tests/bugs, docs, safe migrations) needs no
permission.

## Definition of done

Requirements understood · existing code inspected · tenant isolation + authorization tested ·
idempotency and provider failure handled · error handling tested · `npm run verify` green ·
no secrets/debug code · docs + ADRs updated · cost, observability and rollback considered.
