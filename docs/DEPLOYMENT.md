# Deployment

## Local development

Prerequisites: Node 22.12+ (see `.nvmrc`; 24 LTS recommended), npm 10+.

```bash
npm install
cp apps/api/.env.example apps/api/.env.local   # edit as needed; never commit
npm run dev                                   # API :4000, web :3000
npm run verify                                # full quality gate
npx playwright install chromium               # once, before the first `npm run test:e2e`
```

## Environments and configuration

| Environment | Config source                                                                      |
| ----------- | ---------------------------------------------------------------------------------- |
| development | `apps/<app>/.env.local` / `.env.development` (gitignored)                          |
| test        | Explicit values in tests; Vitest sets `NODE_ENV=test`                              |
| production  | Environment variables injected by the platform's secret manager; env files ignored |

Each app documents its variables in its own `.env.example`.

## CI

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`/`development`: install → format
→ lint → typecheck → unit → integration → build → dependency audit → Playwright E2E. Any failure
blocks the merge once branch protection is enabled on the remote.

## Production (not yet decided)

Hosting platform, regions, container strategy and CD are **undecided** (product-brief open
question 7). Requirements the chosen platform must meet:

- Deploys only from `main` after CI passes, then runs smoke tests (health, key flow).
- Database migrations run as a separate, reviewed step; never destructive automatically.
- **Rollback:** immutable build artifacts per commit; roll back by redeploying the previous
  artifact. Migrations must be backward compatible (expand → migrate → contract) so the previous
  release keeps working.
- **Backups:** managed PostgreSQL with point-in-time recovery and regularly tested restores;
  object storage versioning for recordings/uploads.
- Secrets from a managed secret store, never baked into images.
