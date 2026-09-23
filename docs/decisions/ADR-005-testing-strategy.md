# ADR-005: Vitest + Playwright testing strategy

- **Status:** Accepted
- **Date:** 2026-09-23

## Decision

| Layer       | Tool                  | Location                   | Runs against                                                       |
| ----------- | --------------------- | -------------------------- | ------------------------------------------------------------------ |
| Unit        | Vitest 5              | `src/**/*.test.ts`         | Pure functions and classes                                         |
| Integration | Vitest 5 + supertest  | `apps/*/test/**/*.test.ts` | The real Nest app from `createApp` (same middleware as production) |
| E2E         | Playwright (Chromium) | `tests/e2e/`               | Production builds of all apps, started with production settings    |

API tests compile with SWC (`unplugin-swc`) for decorator metadata. When PostgreSQL/Redis arrive,
integration tests run against real containers (Docker Compose locally, service containers in CI),
not mocks. Tenant-isolation and authorization suites are mandatory for every data-touching feature.

## Consequences

- The E2E stage requires `npm run build` first; `verify` and CI enforce the order.
- One test runner for unit and integration keeps configuration minimal.
