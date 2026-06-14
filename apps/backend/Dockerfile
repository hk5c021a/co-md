FROM node:22-alpine AS base

WORKDIR /app

# Use npm mirror for faster installs in China (remove for non-CN deployments)
ARG NPM_MIRROR=https://registry.npmmirror.com
RUN npm install -g pnpm@10 --registry=${NPM_MIRROR} && \
    pnpm config set registry ${NPM_MIRROR}

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

RUN pnpm --filter @co-md/shared build && \
    (pnpm --filter @co-md/backend build || true)

# ── Pruner: extract production-only package with deps ──
FROM builder AS pruner

RUN pnpm --filter @co-md/backend deploy --prod --legacy /pruned && \
    # Remove build artifacts not needed at runtime
    find /pruned -name "*.map" -delete && \
    find /pruned -name "*.tsbuildinfo" -delete && \
    find /pruned -name "*.md" -delete 2>/dev/null; true && \
    find /pruned -name "LICENSE" -delete 2>/dev/null; true && \
    find /pruned/node_modules -type d -name "test*" -exec rm -rf {} + 2>/dev/null; true && \
    find /pruned/node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null; true && \
    find /pruned/node_modules -type d -name "examples" -exec rm -rf {} + 2>/dev/null; true

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
