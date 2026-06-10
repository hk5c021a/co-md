FROM node:20.18-alpine AS base

WORKDIR /app

RUN npm install -g pnpm@10

# ── Deps: install all workspace dependencies ──
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

RUN pnpm install --frozen-lockfile

# ── Builder: compile TypeScript ──
FROM deps AS builder

COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src/
COPY apps/backend/tsconfig.json ./apps/backend/
COPY apps/backend/src ./apps/backend/src/

RUN pnpm --filter @collab/shared build && \
    (pnpm --filter @collab/backend build || true)

# ── Pruner: extract production-only package with deps ──
FROM builder AS pruner

RUN pnpm --filter @collab/backend deploy --prod --legacy /pruned

# NOTE: Frontend files are served by the backend via serveStatic (see index.ts).
# In production, mount apps/frontend/dist into /app/frontend/dist or use the
# nginx-frontend profile as an alternative. The backend image no longer bundles
# frontend artifacts — this keeps images smaller and decouples build pipelines.

# ── Runner: minimal production image ──
FROM node:20.18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=384"

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    apk upgrade --no-cache

COPY --from=pruner /pruned /app
COPY apps/backend/healthcheck.mjs /app/healthcheck.mjs
COPY apps/backend/drizzle /app/drizzle

USER nodejs

STOPSIGNAL SIGTERM

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node /app/healthcheck.mjs

CMD ["node", "--enable-source-maps", "dist/index.js"]
