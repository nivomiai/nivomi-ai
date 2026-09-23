# ADR-003: NestJS 12 (ESM) for the API

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

The API needs dependency injection, clear module boundaries (ADR-001), guards/interceptors for
centralized authorization and tenancy, and a mature ecosystem for queues and validation.

## Decision

NestJS 12 on Express 5, as native ESM. Build with plain `tsc` (`tsconfig.build.json`); the Nest CLI
is not used because its schematics dependency crashes on Node 22.12 (`ERR_REQUIRE_CYCLE_MODULE`)
and it adds nothing a `tsc` build needs. Development uses `scripts/dev.js` (`tsc --watch` +
`node --watch`).

Baseline pipeline: nestjs-pino (structured logs, request IDs), helmet, CORS allowlist, 1 MB JSON
limit, URI versioning (`/api/v1`), global exception filter with a stable error envelope.

## Consequences

- Relative imports require `.js` extensions (ESM).
- Decorator metadata is required for DI: injected classes must be value imports, and Vitest uses
  SWC (esbuild cannot emit metadata).
- Nest code generators (`nest g`) are unavailable; modules are written by hand.
