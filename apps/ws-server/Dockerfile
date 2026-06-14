FROM node:22-alpine AS base

WORKDIR /app

RUN npm install -g pnpm@10

# ── Deps: install all workspace dependencies ──
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/ws-server/package.json ./apps/ws-server/

RUN pnpm install --frozen-lockfile

# ── Builder: compile TypeScript ──
FROM deps AS builder

COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src/
COPY apps/ws-server/tsconfig.json ./apps/ws-server/
COPY apps/ws-server/src ./apps/ws-server/src/

RUN pnpm --filter @co-md/shared build && \
    (pnpm --filter @co-md/ws-server build || true)

# ── Pruner: extract production-only package with deps ──
FROM builder AS pruner

RUN pnpm --filter @co-md/ws-server deploy --prod --legacy /pruned && \
    find /pruned -name "*.map" -delete && \
    find /pruned -name "*.tsbuildinfo" -delete && \
    find /pruned -name "*.md" -delete 2>/dev/null; true && \
    find /pruned -name "LICENSE" -delete 2>/dev/null; true && \
    find /pruned/node_modules -type d -name "test*" -exec rm -rf {} + 2>/dev/null; true && \
    find /pruned/node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null; true && \
    find /pruned/node_modules -type d -name "examples" -exec rm -rf {} + 2>/dev/null; true

# ── Runner: minimal production image ──
FROM node:20.18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=384"

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    apk upgrade --no-cache

COPY --from=pruner /pruned /app
COPY apps/ws-server/healthcheck.mjs /app/healthcheck.mjs

USER nodejs

STOPSIGNAL SIGTERM

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node /app/healthcheck.mjs

CMD ["node", "--enable-source-maps", "dist/index.js"]
