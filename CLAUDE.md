# CLAUDE.md

本文件为 Claude Code 在本代码库工作时提供指导。

## 项目概述

**CO-MD** — 在线实时 Markdown 协同编辑系统。基于 Yjs CRDT + Milkdown Crepe 编辑器，支持多用户实时协作、权限管理、文件上传。

**阶段**：开发中（Dev 模式可运行，生产模式待完善）

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
certs/              # mkcert TLS 证书（key.pem + cert.pem）
infra/              # Docker 配置（开发/生产 compose）
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
SMTP_FROM=noreply@collab.local \
PASSWORD_RESET_BASE_URL=https://localhost:5173 \
pnpm --filter @collab/backend dev &
pnpm --filter @collab/ws-server dev &
pnpm --filter @collab/frontend dev
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
- **Rate Limit**: 30 req/60s on /api/auth/*
- **Body Limit**: 10MB 全局请求体限制（排除 /api/upload）
- **CORS**: Whitelist origin only
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control, X-Download-Options, X-Permitted-Cross-Domain-Policies, COOP, COEP, HSTS(prod), Cache-Control: no-store

### PWA
- `vite-plugin-pwa` (generateSW mode，VitePlus/Rolldown 兼容)
- Workbox 缓存策略：JS/CSS/Font → CacheFirst, Image → StaleWhileRevalidate, API → NetworkFirst, HTML → NetworkOnly
- `index.html` 预缓存 (CSP nonce placeholder)
- `injectRegister: 'auto'`, `registerType: 'autoUpdate'`
- Dev mode: `devOptions: { enabled: true }`

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
pnpm --filter @collab/shared test  # 运行共享包测试
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

1. **TypeScript 类型错误**: backend 约 23 个类型错误（repository 层 schema 属性不匹配），不影响运行时
2. **生产构建**: 被 TS 错误阻塞，需要修复类型才能 `pnpm build`
3. **编辑器**: 远程光标渲染待完善（Milkdown Crepe 不支持原生 ProseMirror Plugin 注入）
4. **WS 协作**: 基础 Yjs 同步可用，但缺少高级特性（文档持久化负载、token 认证等）
5. **集成测试**: 8 个集成测试因环境依赖（需运行中服务器+数据库）无法在纯 vitest 环境中通过

## 测试覆盖

| 包 | 文件 | 测试数 | 命令 |
|---|------|--------|------|
| packages/shared | 4 | 92 | `pnpm --filter @collab/shared test` |
| apps/backend | 8 | 149 | `pnpm --filter @collab/backend test` |
| apps/frontend | 10 | 118 | `pnpm --filter @collab/frontend test` |
| apps/ws-server | 2 | 20 | `pnpm --filter @collab/ws-server test` |
| **总计** | **24** | **379** | `pnpm -r --parallel test` |
