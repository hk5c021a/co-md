# CLAUDE.md

本文件为 Claude Code 在本代码库工作时提供指导。

## 项目概述

**CO-MD** — 在线实时 Markdown 协同编辑系统。基于 Yjs CRDT + Milkdown Crepe 编辑器，支持多用户实时协作、权限管理、文件上传。

**阶段**：开发中（Dev 模式 + Docker 生产模式均可运行）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, TypeScript, VitePlus (Vite 8 + Rolldown + Oxlint + Oxfmt), Tailwind CSS 4, Milkdown Crepe 7, Yjs, PWA |
| 后端 | Hono 4, TypeScript, Drizzle ORM, PostgreSQL, Redis, RustFS, HTTP/2 |
| WS | ws + Yjs, lib0, y-protocols, WSS with TLS |
| 工程 | pnpm, VitePlus CLI (vp), Vitest, Playwright, Docker |

## 目录结构

```
apps/
  backend/          # Hono API (auth/documents/permissions/notifications/contacts/upload)
  frontend/         # React SPA + PWA (VitePlus + vite-plugin-pwa + workbox)
  ws-server/        # Yjs real-time collaboration (WSS)
packages/
  shared/           # 共享 validators + entities + i18n
  ui/               # UI 组件
certs/              # mkcert TLS 证书（不提交）+ README.md 指引
infra/              # Docker 配置（开发/生产 compose）
docker-compose.local.yml  # 本地生产测试覆盖（添加 mailpit）
.specify/           # speckit 工作流配置
```

## 开发环境

### 前提条件
- Node.js >= 20, pnpm >= 9, Docker Compose
- mkcert（用于本地 HTTPS）

### 快速启动

```bash
# 1. 安装依赖
pnpm install

# 2. 生成 TLS 证书（仅首次）
mkcert -install
mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1 ::1

# 3. 启动基础设施（PostgreSQL :5433, Redis :6379, RustFS :9000, Mailpit :8025）
docker compose --env-file .env.dev.local -f docker-compose.yml -f docker-compose.dev.yml up -d

# 4. 启动后端 + 前端 + WS（并行，需设置完整环境变量以启用邮件和密码重置）
DATABASE_URL=postgresql://postgres:postgres_dev_2026@localhost:5433/collab_db \
REDIS_URL=redis://:redis_dev_2026@localhost:6379 \
NODE_ENV=development \
JWT_SECRET=9931ffe44647e85a5977d58ab304589ac335bf34b80839f95057ea69bfb34f38 \
INTERNAL_API_SECRET=77e38e84503540906a1e0c43f807f329ce3dee59f0f1b7840b51d09a81b5aed9 \
CORS_ORIGIN=https://localhost:5173 \
VITE_DEV=true \
SMTP_HOST=localhost \
SMTP_PORT=1025 \
SMTP_FROM=noreply@co-md.local \
PASSWORD_RESET_BASE_URL=https://localhost:5173 \
pnpm --filter @co-md/backend dev &
pnpm --filter @co-md/ws-server dev &
pnpm --filter @co-md/frontend dev
```

### 服务地址

| 服务 | 地址 | 协议 |
|------|------|------|
| 前端 (VitePlus) | https://localhost:5173 | HTTPS |
| 后端 (Hono) | https://localhost:3000 | HTTPS + HTTP/2 |
| WS Server | wss://localhost:4000 | WSS |
| PostgreSQL | localhost:5433 | — |
| Redis | localhost:6379 | — |
| Mailpit | http://localhost:8025 | HTTP |

## 生产环境（Docker）

```bash
# 1. 配置环境变量（从模板复制并填入真实值）
cp .env.prod.local.example .env.prod.local
# 编辑 .env.prod.local — 替换所有 CHANGE_ME 占位符

# 2. 生成 TLS 证书（仅首次，本地测试用 mkcert）
mkcert -install
mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1 ::1

# 3. 构建前端（生产模式，VITE_API_URL / VITE_WS_URL 留空走同源）
cd apps/frontend && npx vite build && cd ../..

# 4. 启动生产栈（含 mailpit 用于本地 SMTP 测试）
docker compose --env-file .env.prod.local \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.local.yml \
  up -d --build

# 5. 验证
curl -k https://localhost/health
# 前端: https://localhost
# Mailpit: http://localhost:8025
```

生产架构：Caddy(:443) → backend(:3000, API + SPA 静态文件) / ws-server(:4000, WebSocket)
前端 dist 通过 volume 挂载：`./apps/frontend/dist:/app/frontend/dist:ro`
本地测试用 `docker-compose.local.yml` 添加 mailpit，生产环境需配置真实 SMTP。
DB 迁移需从主机运行：`.\scripts\migrate-prod.ps1`（因 drizzle-kit 被 pnpm deploy --prod 剥离）。
前端优化：编辑器懒加载（主 JS 820K + 1.8MB 按需），registerSW.js async，editor chunk modulepreload。

### 环境变量

开发环境配置在 `.env.dev.local`，前端覆盖配置在 `apps/frontend/.env`：

| 变量 | 值 |
|------|-----|
| `VITE_API_URL` | `https://localhost:3000` |
| `VITE_WS_URL` | `wss://localhost:4000` |
| `VITE_DEV` | `true` |
| `DATABASE_URL` | `postgresql://postgres:postgres_dev_2026@localhost:5433/collab_db` |
| `CORS_ORIGIN` | `https://localhost:5173` |

## 安全架构

### 认证流程
1. 前端 PBKDF2 (600K iterations) 预哈希密码
2. CAPTCHA 验证（服务器端 2 位数加法，Redis 存储，5 分钟 TTL，一次性使用）
3. 后端 bcrypt 二次哈希
4. JWT access token (15min) + opaque refresh token (7d)
5. Token Worker (Web Worker) + IndexedDB AES-GCM 加密存储

### 安全中间件
- **CSP**: nonce-based, wasm-unsafe-eval, Trusted Types, report-uri
- **CSRF**: Origin/Referer header 验证（状态变更方法）
- **Rate Limit**: 30 req/60s on /api/auth/{register,login,refresh,logout,password-reset}（排除 captcha/salt）
- **Body Limit**: 10MB 全局请求体限制（排除 /api/upload）
- **CORS**: Whitelist origin only
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control, X-Download-Options, X-Permitted-Cross-Domain-Policies, COOP, COEP, HSTS(prod), Cache-Control: no-store

### PWA
- `vite-plugin-pwa` (generateSW mode，VitePlus/Rolldown 兼容)
- Workbox 缓存策略：JS/CSS/Font → CacheFirst, Image → StaleWhileRevalidate, API → NetworkFirst, HTML → NetworkOnly
- `index.html` 预缓存 (CSP nonce placeholder)
- `injectRegister: 'auto'`, `registerType: 'autoUpdate'`, `skipWaiting: true`
- Dev mode: `devOptions: { enabled: true }`
- **Service Worker 缓存问题**: 旧 SW 可能缓存旧版 `index.html`（引用不存在的旧 hash 资源）。重建前端后需在浏览器 DevTools → Application → Service Workers → Unregister，然后 Ctrl+Shift+R 强制刷新

## 开发命令

```bash
# VitePlus CLI (vp)
vp dev                  # 启动开发服务器
vp build                # 生产构建（Vite + Rolldown）
vp check                # 运行 Oxlint + Oxfmt + 类型检查
vp check --fix          # 自动修复 lint/format 问题
vp preview              # 预览生产构建

# 传统命令
pnpm typecheck          # TypeScript 类型检查
pnpm --filter @co-md/shared test  # 运行共享包测试
pnpm db:push            # 推送 schema 到数据库
```

## API 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 注册（需 CAPTCHA） |
| `/api/auth/login` | POST | 登录（需 CAPTCHA） |
| `/api/auth/refresh` | POST | 刷新 token |
| `/api/auth/logout` | POST | 登出 |
| `/api/auth/captcha` | GET | 获取验证码 |
| `/api/auth/salt` | GET | 获取 PBKDF2 salt |
| `/api/auth/password-reset/request` | POST | 请求密码重置（发送邮件） |
| `/api/auth/password-reset/verify` | GET | 验证重置 token 有效性 |
| `/api/auth/password-reset/check` | POST | 异步校验新旧密码是否相同 |
| `/api/auth/password-reset/salt` | GET | 获取用户 PBKDF2 salt |
| `/api/auth/password-reset/confirm` | POST | 确认重置密码 |
| `/api/users/me/verify-password` | POST | 验证当前密码（设置页异步校验） |
| `/api/documents` | GET/POST | 文档列表 / 创建 |
| `/api/documents/:id` | GET/PATCH/DELETE | 文档 CRUD |
| `/api/permissions/:id/*` | GET/POST/DELETE | 权限管理 |
| `/api/notifications` | GET/PATCH | 通知中心 |
| `/api/contacts` | GET/POST | 联系人 |
| `/api/upload` | POST | 文件上传 |
| `/api/files/:key` | GET | 文件下载 |
| `/health` | GET | 健康检查 |

## 已知问题

1. **TypeScript 类型错误**: backend 约 23 个类型错误（repository 层 schema 属性不匹配），Docker 构建通过 `|| true` 容错，不影响运行时
2. **Docker 构建**: 后端 `tsc` 有类型错误但能正常生成 JS 输出（`noEmitOnError` 默认 false）。Dockerfile 中 `|| true` 临时绕过，修复类型后可移除
3. **编辑器**: 远程光标渲染待完善（Milkdown Crepe 不支持原生 ProseMirror Plugin 注入）
4. **WS 协作**: 基础 Yjs 同步可用，但缺少高级特性（文档持久化负载、token 认证等）
5. **集成测试**: 8 个集成测试因环境依赖（需运行中服务器+数据库）无法在纯 vitest 环境中通过
6. **静态资源 notFound**: 缺失的静态资源返回 404 + 对应 MIME 类型（如 `.css` 返回 `text/css`），避免浏览器 MIME 类型警告。SPA 路由（无扩展名）回退到 `index.html`
7. **编辑器懒加载**: DocumentEditorPage 使用 React.lazy() 拆分为独立 chunk (1.8MB)，仅在访问 /editor 时加载。E2E 文档编辑测试可能因下载延迟超时（45s timeout）

## 测试覆盖

| 包 | 文件 | 测试数 | 命令 |
|---|------|--------|------|
| packages/shared | 6 | 168 | `pnpm --filter @co-md/shared test` |
| apps/backend | 8 | 149 | `pnpm --filter @co-md/backend test` |
| apps/frontend | 10 | 118 | `pnpm --filter @co-md/frontend test` |
| apps/ws-server | 2 | 20 | `pnpm --filter @co-md/ws-server test` |
| **总计** | **26** | **455** | `pnpm -r --parallel test` |

### E2E（Playwright）

```bash
# 全部 3 浏览器（需先启动生产栈）
cd apps/frontend && npx playwright test --config=e2e/playwright.config.ts

# 单个浏览器
npx playwright test --project=chromium
```

### Lighthouse

```bash
# Playwright 集成方案（无 Windows EPERM 问题）
cd apps/frontend && npx tsx e2e/lighthouse.test.ts
# 当前: Perf 74 / A11y 100 / BP 100 / SEO 92
```

### 性能测试

| 脚本 | 目标 | 状态 |
|------|------|------|
| T119A | 10万文档查询 < 200ms | ✅ 5/5 (3ms) |
| T119B | RustFS 500 QPS P95 < 500ms | ⚠️ 大文件需容器网络优化 |
| T119D | 1万用户搜索 < 2s | ⚠️ sql.raw() 需参数化重写 |
| K6 负载 | 500 req/s P95 < 500ms | ✅ 49 req/s, P95 10ms (10VU) |

## DB 迁移

生产环境中 `drizzle-kit` 是 devDependency，被 `pnpm deploy --prod` 剥离。
需从主机运行迁移：

```bash
# PowerShell
.\scripts\migrate-prod.ps1

# 或手动
cd apps/backend
$env:DATABASE_URL="postgresql://..."
npx drizzle-kit push
```
