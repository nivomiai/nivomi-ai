# Nivomi AI

Multi-tenant SaaS platform for AI voice agents, customer lifecycle automation, campaigns, CRM
integration and usage-based billing.

> **Status:** foundation only. No product features yet; see [docs/ROADMAP.md](docs/ROADMAP.md).

## Quick start

```bash
npm install
cp apps/api/.env.example apps/api/.env.local
npm run dev            # API http://localhost:4000/api/v1/health · web http://localhost:3000
npm run verify         # format, lint, typecheck, tests, build, audit, e2e
```

The first E2E run needs a browser: `npx playwright install chromium`.

## Repository

| Path              | What                                                    |
| ----------------- | ------------------------------------------------------- |
| `apps/api`        | NestJS 12 API (modular monolith)                        |
| `apps/web`        | Next.js 16 web app                                      |
| `packages/config` | Centralized environment validation                      |
| `tests/e2e`       | Playwright smoke tests                                  |
| `docs/`           | Architecture, ADRs, security, BMAD planning and stories |

## How we work

Engineering rules, the quality gate and the BMAD workflow are in [CLAUDE.md](CLAUDE.md).
Branches: `main` ← `development` ← `feature/*` · `fix/*` · `chore/*` · `docs/*`.
Documentation index: [docs/README.md](docs/README.md).
