FROM node:20.18-alpine AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
COPY apps/frontend/package.json ./apps/frontend/

RUN npm install -g pnpm@10 && \
    pnpm install --frozen-lockfile

FROM node:20.18-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@10

COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps ./apps

# Copy source code (not just package.json stubs from deps)
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src/
COPY apps/frontend/tsconfig.json ./apps/frontend/
COPY apps/frontend/vite.config.ts ./apps/frontend/
COPY apps/frontend/index.html ./apps/frontend/
COPY apps/frontend/src ./apps/frontend/src/
COPY apps/frontend/public ./apps/frontend/public/

RUN pnpm --filter @collab/shared build && pnpm --filter @collab/frontend build

FROM nginx:1.27-alpine AS runner

RUN addgroup -g 1001 -S nginxgrp && \
    adduser -S nginxusr -u 1001 -G nginxgrp && \
    sed -i 's/^user\s\+nginx;/user nginxusr;/' /etc/nginx/nginx.conf

RUN apk upgrade --no-cache

COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Removed USER nginxusr — nginx.conf already sets user nginxusr for worker privilege de-escalation.
# The master process needs root to bind port 80.

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
