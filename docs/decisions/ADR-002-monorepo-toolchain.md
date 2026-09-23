# ADR-002: npm-workspaces monorepo and TypeScript toolchain

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

API, web app, future workers and shared packages must share types and configuration and be
verified together. No package manager or toolchain was established.

## Decision

- **npm workspaces** (`packages/*` built before `apps/*`). Chosen by the project owner over pnpm
  because it needs no extra tooling. No Turborepo/Nx until build times justify it.
- **TypeScript 6.0.x**, strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  TypeScript 7 was not adopted: typescript-eslint supports `<6.1`.
- **ESLint 9** flat config with type-aware `typescript-eslint` rules, zero warnings allowed.
  ESLint 10 requires Node ≥ 22.13 (local Node is 22.12).
- **Prettier** for formatting; LF line endings enforced via `.gitattributes`.
- Workspace packages export a custom `@nivomi/source` condition pointing at TypeScript source.
  Typecheck and tests resolve source (no pre-build needed); builds and runtime use `dist/`.

## Consequences

- One `npm run verify` gates the whole repository.
- npm's hoisting is less strict than pnpm: phantom dependencies are possible and caught only in
  review. Every workspace must declare what it imports.
- Upgrading Node to 24 LTS unblocks ESLint 10 (TECH_DEBT).
