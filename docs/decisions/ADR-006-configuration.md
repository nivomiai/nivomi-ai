# ADR-006: Centralized, fail-fast configuration

- **Status:** Accepted
- **Date:** 2026-09-23

## Decision

- Every deployable validates its environment at startup with a zod schema via
  `@nivomi/config`'s `parseEnv`, and exits non-zero on any violation. Error messages name the
  variable and rule but **never the value**.
- Empty values (`KEY=`) count as unset, so blanks copied from `.env.example` cannot pass.
- Env files (`.env.<NODE_ENV>.local`, `.env.local`, `.env.<NODE_ENV>`) are loaded **only outside
  production** and never override real environment variables. Production configuration comes
  from the platform's secret manager as environment variables.
- `NODE_ENV` is required; production-only rules (e.g. explicit `CORS_ALLOWED_ORIGINS`) are
  enforced in the schema.
- Each app owns an `.env.example` next to it (only these are committed). Operational settings
  (providers, models, limits, flags) will live in the database behind Super Admin, not in env.

## Consequences

- Misconfiguration surfaces at deploy time, not at first request.
- Services receive typed config through DI (`API_ENV`) and never read `process.env` directly.
