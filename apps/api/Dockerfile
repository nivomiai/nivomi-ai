# syntax=docker/dockerfile:1.7
#
# Nivomi API — production container. Multi-stage build; final image runs as a
# non-root user, contains only the compiled JavaScript and the runtime
# dependencies, and starts `node dist/main.js` on port 4000.
#
# Built from the monorepo root: `docker build -f apps/api/Dockerfile .`
# The compose file at the repo root drives it in one line.

# ─── 1. Base ──────────────────────────────────────────────────────────────
# Pin the Node major to what package.json's `engines.node` requires (>=22.12).
ARG NODE_VERSION=22.12-alpine
FROM node:${NODE_VERSION} AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
WORKDIR /repo

# ─── 2. Install: full dev deps for building ───────────────────────────────
# The API depends on workspace packages (@nivomi/config, @nivomi/database),
# so the root `npm ci` installs everything, then the tsc build compiles
# only what the API and its packages need.
FROM base AS deps
# Copy the manifests only, so `npm ci` cache-hits until they change.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
# Fetch every workspace once; ignore scripts (no postinstall on this repo).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --no-audit --no-fund

# ─── 3. Build ─────────────────────────────────────────────────────────────
FROM deps AS build
# Copy the source needed to build the API and its workspace deps.
# tsconfig.base.json holds the compiler options every workspace extends —
# `types: ["node"]` is set there, so leaving it out breaks the build silently.
COPY tsconfig.json tsconfig.base.json ./
COPY packages/config packages/config
COPY packages/database packages/database
COPY apps/api apps/api
# Root `build` runs `packages/*` before `apps/*` (see root package.json).
# We build only what the API needs to keep the layer tight.
RUN npm run build -w @nivomi/config \
 && npm run build -w @nivomi/database \
 && npm run build -w @nivomi/api

# ─── 4. Prune: production-only node_modules ───────────────────────────────
# `npm ci --omit=dev` re-installs from the lockfile without dev dependencies,
# which is safer than trimming node_modules by hand.
FROM base AS prune
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# ─── 5. Runtime ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

# Bring in the pruned dependency graph and the compiled workspace outputs.
COPY --from=prune  /repo/node_modules ./node_modules
COPY --from=prune  /repo/package.json ./package.json
# Workspace packages live under node_modules/@nivomi/* as symlinks; npm ci
# resolves them from the local sources, so we need the built `dist/` alongside.
COPY --from=build  /repo/packages/config/dist    ./packages/config/dist
COPY --from=build  /repo/packages/config/package.json ./packages/config/package.json
COPY --from=build  /repo/packages/database/dist  ./packages/database/dist
COPY --from=build  /repo/packages/database/package.json ./packages/database/package.json
# Migrations are runtime data: the API applies them on startup outside prod
# and Phase 11 will run them as a separate deploy step in prod.
COPY --from=build  /repo/packages/database/migrations ./packages/database/migrations
COPY --from=build  /repo/apps/api/dist           ./apps/api/dist
COPY --from=build  /repo/apps/api/package.json   ./apps/api/package.json

# Least-privilege user. `node` (uid 1000) already exists in the base image.
USER node

EXPOSE 4000

# Liveness probe: HEALTH_URL points at the /health endpoint that returns
# `{status:"ok"}`. The compose file wires the same URL for orchestration.
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||4000) +'/api/v1/health').then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"

# `tini` is not installed here; Node handles SIGTERM cleanly, and Nest's
# `enableShutdownHooks` (already configured in app.factory.ts) drains
# connections before exit.
CMD ["node", "apps/api/dist/main.js"]
