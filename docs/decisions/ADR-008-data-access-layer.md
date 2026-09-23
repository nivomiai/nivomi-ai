# ADR-008: PostgreSQL data-access layer

- **Status:** Proposed. Decide during `bmad-architecture`, before the first persistent story.
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

Pending.
