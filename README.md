# CO-MD — Collaborative Markdown Editor

在线实时 Markdown 协同编辑系统。基于 Yjs CRDT + Milkdown Crepe，支持多人实时协作。

## 功能

- **实时协同编辑** — Yjs CRDT，多人实时同步
- **WYSIWYG Markdown** — Milkdown Crepe 编辑器，语法高亮
- **文档管理** — CRUD + 文件夹
- **权限控制** — read-only / read-write / owner
- **联系人系统** — 邀请制协作
- **PWA** — Service Worker + Workbox 缓存策略
- **中英文 i18n**

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, VitePlus (Vite 8 + Rolldown + Oxlint + Oxfmt), Tailwind CSS 4, Milkdown Crepe 7, Yjs, PWA |
| 后端 | Hono 4, TypeScript, Drizzle ORM, PostgreSQL, Redis, HTTP/2 |
| WS | ws + Yjs + lib0 + y-protocols, WSS |
| 工程 | pnpm (monorepo), VitePlus CLI (vp), Vitest, Docker |

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 生成 TLS 证书
mkcert -install
mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1 ::1

# 3. 启动基础设施
docker compose --env-file .env.dev.local -f docker-compose.yml -f docker-compose.dev.yml up -d

# 4. 启动开发服务
DATABASE_URL=postgresql://postgres:postgres_dev_2026@localhost:5433/collab_db \
  pnpm --filter @co-md/backend dev &
pnpm --filter @co-md/ws-server dev &
pnpm --filter @co-md/frontend dev
```

### 服务地址

| 服务 | 地址 |
|------|------|
| 前端 | https://localhost:5173 |
| 后端 | https://localhost:3000 |
| WS | wss://localhost:4000 |
| Mailpit | http://localhost:8025 |

## 生产部署

```bash
cp .env.prod.local.example .env.prod.local   # 编辑填入真实值
mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1 ::1
cd apps/frontend && npx vite build && cd ../..
docker compose --env-file .env.prod.local -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.local.yml up -d --build
```
生产模式通过 Caddy 反向代理，前端 → `https://localhost`，Mailpit → `http://localhost:8025`。

## 安全

- **认证**: PBKDF2 (600K) → CAPTCHA → bcrypt → JWT + Refresh Token
- **Token Worker**: Web Worker + IndexedDB AES-GCM
- **CSP**: nonce-based + Trusted Types + wasm-unsafe-eval
- **CSRF**: Origin 头验证
- **Rate Limit**: 30 req/60s on auth endpoints
- **HTTPS + HTTP/2 + WSS**: mkcert 本地证书

## 目录结构

```
apps/backend/     # Hono API
apps/frontend/    # React SPA + PWA
apps/ws-server/   # Yjs WSS server
packages/shared/  # validators / entities / i18n
packages/ui/      # UI 组件
certs/            # TLS 证书（不提交）+ mkcert 指引
specs/            # 功能规格文档
docker-compose.local.yml  # 本地生产测试配置
```

## 测试

```bash
pnpm -r --parallel test            # 全部 455 单元测试
cd apps/frontend && npx playwright test --config=e2e/playwright.config.ts  # E2E (3 browsers)
npx tsx e2e/lighthouse.test.ts     # Lighthouse (Perf 74 / A11y 100 / BP 100 / SEO 92)
```

## 开发命令

```bash
pnpm typecheck                    # TS 类型检查
pnpm --filter @co-md/shared test # 单元测试
DATABASE_URL=... pnpm db:push     # DB schema 同步
.\scripts\migrate-prod.ps1        # 生产 DB 迁移
```
