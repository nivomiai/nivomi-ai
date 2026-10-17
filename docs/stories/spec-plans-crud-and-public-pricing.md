---
title: 'Plans CRUD in Super Admin + public pricing on the marketing site'
type: 'feature'
created: '2026-10-06'
status: 'proposed'
route: 'build'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/decisions/ADR-027-usage-metering-and-billing.md'
  - '{project-root}/docs/stories/spec-phase-8-billing.md'
  - '{project-root}/apps/web/components/app/screens/PlatformCustomisation.tsx'
  - '{project-root}/apps/web/public/site/home.html'
---

## Intent

**Problem.** Phase 8 shipped the `plans` and `organization_plans` tables and a private
`BillingService.assignPlan(...)`, but no controller exposes plan CRUD, no Super Admin UI edits
plans, and the marketing homepage uses a hardcoded `PLAN_PRICING` JS object (home.html:1710)
instead of reading from the database. The Super Admin "Customisation" page shows plan tiles as
hardcoded visual previews ([`PlatformCustomisation.tsx`](apps/web/components/app/screens/PlatformCustomisation.tsx))
and admits it in the subtitle.

This story closes that loop: Super Admin creates/edits/archives plans → DB is authoritative → the
public pricing section reads from a safe-shape API → one place to change prices.

**Approach.**

1. New backend module `apps/api/src/platform-plans/` (own module, not inside `billing/`, since the
   lifecycle is platform-wide, not tenant-owned):
   - `GET  /api/v1/platform/plans` — list all (ACTIVE + ARCHIVED), with per-plan org count.
   - `POST /api/v1/platform/plans` — create.
   - `PUT  /api/v1/platform/plans/:id` — update.
   - `POST /api/v1/platform/plans/:id/archive` — soft delete (status→ARCHIVED). Hard delete is
     refused if any `organization_plans` row with status=ACTIVE references the plan — this
     protects the FK and keeps invoices reproducible.
   - All guarded by a new permission `platform.plans.manage`, which is granted only when
     `users.isSuperAdmin = true` (same gate as the existing `/platform/*` endpoints).
   - Every write writes an audit row (`platform.plan.created|updated|archived`) with the actor,
     diff and request id.
2. New public endpoint `GET /api/v1/plans/public` (no auth, no tenant context):
   - Returns only plans with `status = ACTIVE`, ordered by `monthlyPaiseInr ASC NULLS LAST`.
   - Projects a safe shape (never ships `overageRates` or any internal flag).
   - Short cache header `Cache-Control: public, max-age=60, s-maxage=60`.
   - Covered by the same rate-limit middleware as other public endpoints.
3. Minimal schema change: add `display_order` INT NOT NULL DEFAULT 0 to `plans` so Super Admin
   can set the marketing order independently of price (Enterprise should sit after Business even
   though its price is "Custom"). Migration `0014_plans_display_order.sql` + Drizzle regen.
   Alternative considered: order by price — rejected because Enterprise ends up first/last by
   accident.
4. New Super Admin page `/app/platform/plans` with:
   - A table of plans (code · name · monthly INR · limits summary · status · orgs using).
   - "Create plan" dialog (code, name, monthly INR, limits per `UsageEventKind`, overage rates
     per kind, display order, status).
   - "Edit" (same form).
   - "Archive" (confirm dialog; blocked with a readable error if orgs are on it).
   - Linked from the sidebar Platform nav (new item between Organizations and Users).
5. `PlatformCustomisation.tsx` stays but is converted from a hardcoded preview to a per-org
   editor: pick an organization from a selector, see its current plan + feature flags, change
   the plan (reuses `BillingService.assignPlan` behind a thin controller endpoint
   `POST /platform/organizations/:id/plan`). The hardcoded `PLAN_OPTIONS`/`FEATURE_FLAGS`
   constants get removed — plans come from the API, flags remain visual-preview with a TODO
   pointing at ADR-???.
6. Marketing homepage ([`apps/web/public/site/home.html`](apps/web/public/site/home.html#L1529)):
   - On DOMContentLoaded, `fetch('/api/v1/plans/public')` and populate the price tiles.
   - Keep the hardcoded `PLAN_PRICING` object as a fallback if the fetch fails (static site must
     still render) and log a `console.warn` with the error.
   - Degrade gracefully: a plan returned by the API is matched by `data-plan` on the card; a
     plan the API doesn't return keeps whatever it had.

**Out of scope.** Prorated plan changes, usage overage preview in UI, invoice regeneration on
plan edit, i18n of plan names, admin bulk-import of plans, Razorpay price-list sync, feature
flag CRUD (comes with the per-org editor extension in a follow-up).

## Significant-feature questions (CLAUDE.md)

| Question                 | Answer                                                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data owner and tenant    | `plans` is platform-owned (no `organization_id`). Only Super Admin writes.                                                                                                                                                                                                         |
| Source of truth          | DB `plans` table. The marketing homepage reads from `/plans/public`; the client-side fallback object in `home.html` is a last-resort render-time fallback, not a source of truth.                                                                                                   |
| Authorization and audit  | New permission `platform.plans.manage`, granted only to `isSuperAdmin`. Public endpoint has no auth. Every write audited (`platform.plan.created|updated|archived`) with before/after diff.                                                                                        |
| Provider failure         | N/A at write time. Public endpoint failure → marketing homepage falls back to the embedded `PLAN_PRICING` object + a `console.warn`; it must never crash the page.                                                                                                                 |
| Duplicate delivery       | `POST /platform/plans` is not idempotent by code (409 on duplicate `code`). `POST /archive` is idempotent (archiving an archived plan is a 200 no-op). Edits take an `If-Unmodified-Since`-style `expectedVersion` field (plans.`updatedAt`) to detect concurrent edits.           |
| Worker crash / DB outage | No worker involvement.                                                                                                                                                                                                                                                             |
| Usage and cost           | Public endpoint hit once per marketing-site visit → cache + 60s TTL = negligible. Super Admin UI reads list on open.                                                                                                                                                               |
| 100× scale               | O(10) plans. No scaling concern.                                                                                                                                                                                                                                                   |

## Acceptance

- Migration `0014_plans_display_order.sql` adds `display_order INT NOT NULL DEFAULT 0`.
- `packages/database/src/schema/billing.ts` updated with `displayOrder: integer('display_order').notNull().default(0)`; `npm run build -w @nivomi/database` is clean.
- New Nest module `platform-plans` with controller + service + unit tests:
  - List returns `{ items: [{ id, code, name, monthlyPaiseInr, limits, overageRates, status, displayOrder, orgsUsing }] }`.
  - Create validates: unique `code` (409 on conflict), `monthlyPaiseInr >= 0`, `limits` keys ∈ `UsageEventKind`, `overageRates` keys ∈ `UsageEventKind`.
  - Update respects `expectedVersion` (409 on mismatch).
  - Archive refuses when `COUNT(*) FROM organization_plans WHERE plan_id = :id AND status = 'ACTIVE'` > 0 (returns `409 PLAN_IN_USE` with the count).
  - Every write writes an `audit_logs` row.
- Permission `platform.plans.manage` added to `authorization/permissions.ts` and only `isSuperAdmin` resolves it. Integration test asserts a non-super-admin ADMIN gets 403.
- Public endpoint `GET /api/v1/plans/public`:
  - Returns only ACTIVE plans.
  - Projects `{ code, name, monthlyPaiseInr, limits: { call_minutes_outbound?: number, ... }, displayOrder }` — no `overageRates`, no `id`.
  - Integration test asserts an ARCHIVED plan is absent.
  - Integration test asserts no auth required (anonymous request succeeds).
- Super Admin UI `/app/platform/plans`:
  - E2E via Playwright: Super Admin signs in, opens Plans, creates a plan "test-plan / Test / ₹999 / 1000 minutes", sees it in the list, edits the name, archives it.
  - Non-super-admin ADMIN redirected / blocked when hitting the URL.
  - Sidebar nav includes "Plans" between "Organizations" and "Users" (Super-Admin-only group ordering already handled).
- `PlatformCustomisation.tsx` reads the real plan list; the hardcoded `PLAN_OPTIONS` constant is removed. (Feature flags stay as visual preview — one `// TODO` line referencing a follow-up story is acceptable.)
- Marketing homepage:
  - On load, fetches `/api/v1/plans/public` and fills price tiles whose `data-plan` matches a returned `code`.
  - If the fetch fails or returns zero plans, the existing hardcoded `PLAN_PRICING` object renders — no visible errors.
  - Playwright test (new `tests/e2e/public-pricing.spec.ts`): visits `/`, intercepts `/api/v1/plans/public` with a seeded response, asserts tile text updates.
- `npm run verify` green.

## Cross-tenant / authZ tests to add

- `apps/api/test/integration/platform-plans.test.ts`:
  - Anonymous `GET /plans/public` → 200.
  - Anonymous CRUD → 401.
  - ADMIN (not super admin) CRUD → 403.
  - SUPER_ADMIN CRUD → 200/201 and writes audit rows.
  - Create with duplicate `code` → 409.
  - Archive while an org is ACTIVE on it → 409 `PLAN_IN_USE`.
  - Public endpoint response has no `overageRates` field (schema assertion).

## Files

- Add: `apps/api/src/platform-plans/platform-plans.module.ts`, `.controller.ts`, `.service.ts`, `.service.test.ts`.
- Add: `apps/api/src/public/plans-public.controller.ts` (or extend an existing public controller if one exists).
- Add: `apps/api/test/integration/platform-plans.test.ts`.
- Add: `packages/database/migrations/0014_plans_display_order.sql` + regenerated meta snapshot.
- Edit: `packages/database/src/schema/billing.ts` (+ `displayOrder`).
- Edit: `apps/api/src/authorization/permissions.ts` (+ `platform.plans.manage`).
- Edit: `apps/api/src/authorization/role-permissions.ts` (grant to `SUPER_ADMIN` only — verify where super-admin grants live).
- Add: `apps/web/components/app/screens/PlatformPlans.tsx`, `apps/web/app/app/platform/plans/page.tsx`.
- Edit: `apps/web/components/app/AppShell.tsx` (sidebar Platform nav — add "Plans" between Organizations and Users).
- Edit: `apps/web/components/app/screens/PlatformCustomisation.tsx` (drop hardcoded `PLAN_OPTIONS`, read from `/platform/plans`).
- Edit: `apps/web/lib/api/types.ts` (+ `Plan`, `PublicPlan`, `UsageEventKind`).
- Edit: `apps/web/public/site/home.html` (fetch + render pricing on load with fallback).
- Add: `tests/e2e/platform-plans.spec.ts`, `tests/e2e/public-pricing.spec.ts`.
- Edit: `apps/api/src/dev/seed-data.ts` (seed 3-4 ACTIVE plans so the marketing site has data in dev — Starter / Growth / Business / Enterprise with realistic rupee prices or a clearly-TBD "₹ —" convention; owner may still swap values later).

## Risks and TECH_DEBT

- Marketing homepage is a static HTML file served from `public/`; adding a `fetch` to the API means the marketing site now depends on the API being up. The fallback object protects render but not price accuracy; if the API is down and prices have changed, the stale fallback shows. Acceptable for MVP; revisit when we move marketing to Next.js SSR.
- The `plans.monthlyPaiseInr` column is `NOT NULL`, so "Enterprise / Custom" has to use a sentinel (e.g. `0` with `name = 'Enterprise'` and a UI "Custom" label when monthlyPaiseInr=0 and limits is empty). TECH_DEBT: add a `kind: 'FIXED' | 'CUSTOM'` column in a follow-up.
- `expectedVersion` concurrency control requires `plans.updatedAt` — add a column + trigger in the same migration (or use `effectiveFrom`, which is close but not the same thing).

## Open questions

- Owner input needed on actual prices and limits for Starter / Growth / Business — current numbers in the UI preview (2000/15000/60000 calls) are illustrative. Seed with placeholders and let the owner edit in-app once this ships.
- Should feature flags also become plan-attached (plan → feature matrix)? Out of scope for this story; captured as follow-up.
