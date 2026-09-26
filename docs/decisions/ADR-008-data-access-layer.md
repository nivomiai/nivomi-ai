# ADR-008: PostgreSQL data-access layer

- **Status:** Accepted, 2026-09-26: Drizzle ORM + drizzle-kit SQL migrations, `pg` (node-postgres) in
  production, PGlite (real PostgreSQL in WASM) for local development and tests.
- **Date:** 2026-09-23

## Context

PostgreSQL is the system of record. The data layer must support versioned migrations, strict
tenant scoping, transactions (outbox pattern), row locking for campaign scheduling, efficient
bulk writes for imports, and possibly row-level security (RLS) as defense in depth.

## Options

| Option                    | Strengths                                                                        | Concerns                                                  |
| ------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Drizzle ORM + drizzle-kit | SQL-first, typed, lightweight; straightforward RLS/session variables and raw SQL | Younger migration tooling; more hand-written SQL          |
| Prisma                    | Mature schema and migrations DX, large ecosystem                                 | Less control over generated SQL; RLS needs extra plumbing |
| Kysely + SQL migrations   | Full SQL control, typed query builder                                            | No schema-to-migration generation                         |

## Leaning

Drizzle ORM: it keeps SQL explicit for tenancy, RLS and locking-heavy campaign logic. This must be
verified against current official documentation (versions, migration workflow, Nest integration)
before it is accepted.

## Decision

- **Drizzle ORM 0.45** holds the schema in `packages/database`. `drizzle-kit` generates plain SQL
  migrations, which are committed and reviewed. Nothing is migrated automatically in production:
  migrations run as a separate deploy step (ADR-010).
- **Drivers:**
  - `pg` against RDS PostgreSQL in production;
  - PGlite (`@electric-sql/pglite`, PostgreSQL 18 in WASM) for local development and
    integration tests. It needs no Docker or local server, and it is real SQL, not mocks.
- **Tenancy:** repositories take the tenant context explicitly and scope every query by
  `organization_id`. Row-level security stays a later defence-in-depth option.
- **Verified 2026-09-26** on this machine: drizzle-orm 0.45.3, drizzle-kit 0.31.11, PGlite 0.5.8
  (PostgreSQL 18.3). `FOR UPDATE SKIP LOCKED` works in PGlite.
