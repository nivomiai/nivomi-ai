# Architecture Decision Records

ADRs live in [decisions/](decisions/). Add one for every decision that is expensive to reverse:
framework, data store, provider strategy, auth, tenancy model, billing semantics. Status is
`Proposed` → `Accepted` → (`Superseded by ADR-xxx`).

| ADR                                                | Title                                            | Status   |
| -------------------------------------------------- | ------------------------------------------------ | -------- |
| [ADR-001](decisions/ADR-001-modular-monolith.md)   | Modular monolith with workers                    | Accepted |
| [ADR-002](decisions/ADR-002-monorepo-toolchain.md) | npm-workspaces monorepo and TypeScript toolchain | Accepted |
| [ADR-003](decisions/ADR-003-nestjs-api.md)         | NestJS 12 (ESM) for the API                      | Accepted |
| [ADR-004](decisions/ADR-004-nextjs-web.md)         | Next.js App Router + Tailwind for the web app    | Accepted |
| [ADR-005](decisions/ADR-005-testing-strategy.md)   | Vitest + Playwright testing strategy             | Accepted |
| [ADR-006](decisions/ADR-006-configuration.md)      | Centralized, fail-fast configuration             | Accepted |
| [ADR-007](decisions/ADR-007-bmad-method.md)        | BMAD Method as the delivery process              | Accepted |
| [ADR-008](decisions/ADR-008-data-access-layer.md)  | PostgreSQL data-access layer                     | Proposed |
