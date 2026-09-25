# Nivomi AI

Multi-tenant SaaS platform for AI voice agents, customer lifecycle automation, campaigns, CRM
integration and usage-based billing.

> **Status:** foundation only. No product features yet; see [docs/ROADMAP.md](docs/ROADMAP.md).

## Tech stack

| Area     | Choice                                                                                |
| -------- | ------------------------------------------------------------------------------------- |
| Monorepo | npm workspaces, TypeScript 6, ESLint 9, Prettier                                      |
| API      | NestJS 12 (ESM), modular monolith, pino structured logging                            |
| Web      | Next.js 16 App Router, Tailwind CSS 4                                                 |
| Config   | `@nivomi/config`: zod-validated, fail-fast environment loading                        |
| Testing  | Vitest (unit + integration), Playwright (E2E against production builds)               |
| CI       | GitHub Actions quality gate, Dependabot                                               |
| Platform | AWS ap-south-1 (decided, not built): [ADR-010](docs/decisions/ADR-010-hosting-aws.md) |

## Prerequisites

- Node.js **22.12+** (`.nvmrc`) and npm 10+. Use npm only, not pnpm or yarn.
- A Chromium browser for E2E tests: `npx playwright install chromium`.

## Quick start

```bash
npm install
cp apps/api/.env.example apps/api/.env.local   # local only, never committed
npm run dev            # API http://localhost:4000/api/v1/health · web http://localhost:3000
npm run verify         # format, lint, typecheck, tests, build, audit, e2e
```

| Command                    | Purpose                                   |
| -------------------------- | ----------------------------------------- |
| `npm run verify`           | Full quality gate; the same steps CI runs |
| `npm run test:unit`        | Vitest, colocated `src/**/*.test.ts`      |
| `npm run test:integration` | Vitest, `apps/*/test/**`                  |
| `npm run test:e2e`         | Playwright (run `npm run build` first)    |
| `npm run lint` / `format`  | ESLint (zero warnings) / Prettier         |

## Repository

| Path              | What                                                    |
| ----------------- | ------------------------------------------------------- |
| `apps/api`        | NestJS 12 API (modular monolith)                        |
| `apps/web`        | Next.js 16 web app                                      |
| `packages/config` | Centralized environment validation                      |
| `tests/e2e`       | Playwright smoke tests                                  |
| `docs/`           | Architecture, ADRs, security, BMAD planning and stories |
| `_bmad/`          | Vendored BMAD Method install (do not hand-edit)         |

## How we work

- **Branches:** `main` (production) ← `develop` (integration) ← `feature/*` · `bugfix/*`;
  `hotfix/*` from `main`. Everything lands by pull request. See [CONTRIBUTING.md](CONTRIBUTING.md).
- **Engineering rules**, the quality gate and the BMAD workflow: [CLAUDE.md](CLAUDE.md).
- **Documentation index:** [docs/README.md](docs/README.md).
- **Security:** never commit secrets or customer data. Report vulnerabilities privately to the
  maintainers, not in issues. Controls are in [docs/SECURITY.md](docs/SECURITY.md).

## License

Proprietary. Copyright © 2026 Nivomi AI. All rights reserved. No license is granted to use,
copy or distribute this code.
