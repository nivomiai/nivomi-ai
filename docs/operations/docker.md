# Docker & docker-compose

The dev loop is `npm run dev` — Node directly, PGlite as an embedded database,
the memory rate-limit store. That is fast and needs nothing beyond Node.

Docker is a second, container-shaped local stack that runs the same code
against **real PostgreSQL** and **real Redis** (via containers). Use it to
catch problems that only surface with the real drivers — DB connection
pooling, cookie flags across container origins, CORS, container start order —
before they hit AWS.

**This is not production.** The compose stack runs `NODE_ENV=development` and
keeps the local dev providers (dev mailbox, local storage, simulated voice).
Production requires SES, S3 and real voice adapters — tracked in
[production-readiness-plan.md](../planning/production-readiness-plan.md)
phases 4c, 9a and 11c. The Dockerfiles are the image contracts that AWS setup
will consume; the compose file is a local convenience today.

## Layout

| File                                             | Purpose                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [apps/api/Dockerfile](../../apps/api/Dockerfile) | Multi-stage build of the Nest API. Final image runs `node dist/main.js` as a non-root user on `:4000`.                                     |
| [apps/web/Dockerfile](../../apps/web/Dockerfile) | Multi-stage build of the Next.js web app. Uses Next's `output: 'standalone'` for a tight image; runs `node apps/web/server.js` on `:3000`. |
| [docker-compose.yml](../../docker-compose.yml)   | Postgres 16, Redis 7, API, web, optional mailbox viewer.                                                                                   |
| [.dockerignore](../../.dockerignore)             | Keeps `node_modules`, `.next`, `.data`, secrets and tests out of the build context.                                                        |
| [.env.docker.example](../../.env.docker.example) | Template for the required env values. Copy → `.env.docker`, fill in.                                                                       |

The Dockerfiles are built **from the repo root**, not from the app directory,
so npm workspaces resolve correctly. The `.dockerignore` at the root controls
the context for both.

## First run

Prerequisites: Docker Desktop (Windows/macOS) or Docker Engine 24+ with
Compose v2 (Linux). On Windows check `docker version` — the CLI is installed
but Docker Desktop must be running.

```powershell
# 1. Copy the template and fill in the required values.
Copy-Item .env.docker.example .env.docker
# Open .env.docker and set AUTH_JWT_SECRET, CREDENTIALS_ENCRYPTION_KEY,
# POSTGRES_PASSWORD to real random strings.

# 2. Build everything and start the stack.
docker compose --env-file .env.docker up --build

# 3. Wait for the health checks to go green (about 30 s the first time),
#    then open http://localhost:3000.
```

Bash equivalent:

```bash
cp .env.docker.example .env.docker
$EDITOR .env.docker
docker compose --env-file .env.docker up --build
```

## Common tasks

Rebuild after a code change:

```bash
docker compose --env-file .env.docker up --build api web
```

Watch API logs only:

```bash
docker compose --env-file .env.docker logs -f api
```

Reset the database and start over (destroys every row):

```bash
docker compose down --volumes
```

Migrations run inside the API container on start. To run them by hand:

```bash
docker compose exec api node apps/api/dist/dev/seed.main.js  # seeds dev data
```

Include the mailbox viewer (a static browser of the dev mailbox on `:8025`):

```bash
docker compose --env-file .env.docker --profile dev up
```

## Image sizes

Both images use Alpine and prune dev dependencies. Measured sizes:

| Image               | Size    | Notes                                                                                                                                                                                                                                         |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nivomi-api:latest` | ~980 MB | Dominated by `@node-rs/argon2` native binary + `@electric-sql/pglite` WASM + Nest runtime. Trimming to ~400 MB is a Phase 11c follow-up (drop PGlite from runtime deps once RDS is default, and use a distroless base for the runtime stage). |
| `nivomi-web:latest` | ~330 MB | Next.js standalone bundle. Full page rendering + React 19 runtime; not much to trim further without shipping a static export.                                                                                                                 |

If a build inflates far past these, check the `.dockerignore` — the most
common regression is `.data/` or a stray `node_modules/` landing in context.

## Security

- Both containers run as the non-root `node` user (uid 1000).
- No secrets baked into layers — every secret comes from the compose
  environment.
- `HEALTHCHECK` on both services; the compose file only starts `web` after
  `api` reports started.
- Ports are bound to `127.0.0.1` in compose, never `0.0.0.0`. Public exposure
  is Phase 11 (behind an ALB + WAF; see the production-readiness plan).

## What this does not replace

- **`npm run dev`** — that stays the fast local loop. Docker is for
  production-shape validation and (later) production deployment.
- **Kubernetes / ECS manifests** — Phase 11 delivers the AWS setup
  ([production-readiness-plan.md §11c](../planning/production-readiness-plan.md)).
  These Dockerfiles are the image contracts those manifests will consume.
- **HTTPS** — Phase 11 terminates TLS at the load balancer. Local compose
  runs on plain HTTP behind `127.0.0.1`.
