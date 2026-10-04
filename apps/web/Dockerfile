# syntax=docker/dockerfile:1.7
#
# Nivomi web (Next.js) — production container. Multi-stage build; the final
# image runs the standalone Next server (`node apps/web/server.js`) as a
# non-root user on port 3000.
#
# Built from the monorepo root: `docker build -f apps/web/Dockerfile .`

ARG NODE_VERSION=22.12-alpine
FROM node:${NODE_VERSION} AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
WORKDIR /repo

# ─── 1. Install: full deps for building ───────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --no-audit --no-fund

# ─── 2. Build ─────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.json tsconfig.base.json ./
COPY packages/config packages/config
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
# Config workspace is a compile dep for the web (type-only), so build it first.
RUN npm run build -w @nivomi/config \
 && npm run build -w @nivomi/web

# ─── 3. Runtime — Next standalone ─────────────────────────────────────────
# The `output: 'standalone'` build puts everything the server needs under
# `.next/standalone/`, with the tracing already applied. No node_modules copy
# from `deps` is needed here.
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

# The standalone build resolves paths from apps/web/, so the layout mirrors
# the monorepo root.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static     ./apps/web/.next/static
COPY --from=build /repo/apps/web/public           ./apps/web/public

USER node

EXPOSE 3000

# Any 2xx/3xx response on the homepage proves the Node server is up. Use
# `--no-check-certificate` never applies here (plain http on localhost).
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||3000) +'/').then(r=>{if(r.status>=500)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
