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

`npm run dev` seeds development data before the API starts (also `npm run db:seed:dev`), defined
in `apps/api/src/dev/seed-data.ts`: organizations in every status (ACTIVE, PENDING_APPROVAL,
SUSPENDED), a member for every tenant role, a platform Super Admin (`admin@example.com`), users in
two organizations, open invitations (`/invite?token=<token>`) and an unverified account. Every
account uses the password `nivomi-dev-admin`. Each start restores the declared accounts, roles,
statuses and open invitations; rows the seed does not declare are left alone. Seed runs are audited
as `platform.dev_seed_applied`; the seed refuses to run when `NODE_ENV=production`. PGlite allows
one process per data directory, so run `db:seed:dev` only while `npm run dev` is stopped.

## Environments and configuration

| Environment | Config source                                                                      |
| ----------- | ---------------------------------------------------------------------------------- |
| development | `apps/<app>/.env.local` / `.env.development` (gitignored)                          |
| test        | Explicit values in tests; Vitest sets `NODE_ENV=test`                              |
| production  | Environment variables injected by the platform's secret manager; env files ignored |

Each app documents its variables in its own `.env.example`.

## CI

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`/`develop`: install → format
→ lint → typecheck → unit → integration → build → dependency audit → Playwright E2E. Any failure
blocks the merge once branch protection is enabled on the remote (settings in
[CONTRIBUTING.md](../CONTRIBUTING.md#branch-protection)).

## Production (decided, not built)

AWS **ap-south-1 (Mumbai)** per [ADR-010](decisions/ADR-010-hosting-aws.md): ECS on Fargate (API,
web, workers) with images in ECR, ALB (HTTP + WebSocket), CloudFront, RDS PostgreSQL, ElastiCache
Redis, S3, Secrets Manager, KMS, CloudWatch. No infrastructure exists yet; it is created as code
by the first infrastructure story. Requirements:

- Deploys only from `main` after CI passes, then runs smoke tests (health, key flow).
- Database migrations run as a separate, reviewed step; never destructive automatically.
- **Rollback:** immutable build artifacts per commit; roll back by redeploying the previous
  artifact. Migrations must be backward compatible (expand → migrate → contract) so the previous
  release keeps working.
- **Backups:** managed PostgreSQL with point-in-time recovery and regularly tested restores;
  object storage versioning for recordings/uploads.
- Secrets from a managed secret store, never baked into images.
