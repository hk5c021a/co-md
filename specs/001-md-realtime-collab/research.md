# 技术研究报告：在线实时 Markdown 协同编辑系统

**日期**：2026-04-18
**对应功能**：`001-md-realtime-collab`

---

## 1. Markdown 编辑器选型

### 决策：CodeMirror 6

### 理由

CodeMirror 6 从设计之初就考虑了协作编辑，其 `@codemirror/collab` 包提供原生的协作编辑接口，与 Yjs CRDT 库深度集成。

- **Yjs 集成成熟**：`y-codemirror.next` 是 CodeMirror 6 与 Yjs 集成的官方绑定包，支持多人协作光标显示（带用户名颜色标记）和离线变更排队。
- **轻量级**：CodeMirror 6 核心约 200KB，相比 Monaco（数 MB）更适合 Web 应用。
- **Markdown 支持完善**：内置 `@codemirror/lang-markdown` 扩展，支持完整 Markdown 语法高亮、行号显示、代码块高亮。
- **离线持久化**：`y-indexeddb` 可将文档变更持久化到浏览器 IndexedDB。

### 替代方案

| 方案 | 被否定理由 |
|------|-----------|
| Monaco Editor | 体积过大（核心约 2.5MB），协作功能主要面向 VS Code 场景，Web 集成需要大量定制 |

---

## 2. 实时协作库选型

### 决策：Yjs + y-websocket

### 理由

1. **生产就绪**：Yjs 已被 GitBook、Linear、Evernote、NextCloud、JupyterLab、AWS SageMaker 等知名产品使用。
2. **CRDT 算法优势**：
   - 相比 OT 更适合大规模协作，实现简单，调试容易
   - 支持离线编辑：变更在本地排队，恢复连接后自动合并
   - 无中央服务器依赖：支持点对点连接
3. **WebSocket 支持完善**：`y-websocket` 提供开箱即用的 WebSocket 服务器和客户端，支持水平扩展。
4. **多编辑者光标**：`y-codemirror.next` 可显示每个协作用户的带颜色标记的光标位置。

### 替代方案

| 方案 | 被否定理由 |
|------|-----------|
| ShareDB | OT 算法实现复杂，调试困难，PostgreSQL 持久化需要额外开发，离线支持需额外实现 |

---

## 3. Hono 认证方案

### 决策：Custom JWT + jose 库

### 理由

1. **Hono 内置 JWT 支持**：Hono 提供 `@hono/jwt` 中间件和 `jose` 库集成，可直接使用。
2. **jose 库优势**：零依赖、tree-shakeable ESM、支持 JWT/JWS/JWE/JWK/JWKS 全套 RFC 标准，跨运行时支持（Node.js、Bun、Deno、Cloudflare Workers），成熟稳定。
3. **双令牌实现**：自定义实现 access token（短期 15 分钟）和 refresh token（长期 7 天），refresh token 存储在 httpOnly cookie 中。

### 替代方案

| 方案 | 被否定理由 |
|------|-----------|
| lucia-auth | v3 将于 2025 年 3 月废弃，主要定位是"教学"而非"库"，需要大量自定义代码 |
| auth.js | 主要面向 Next.js，Hono 不是官方支持框架，集成复杂度高 |

---

## 4. WebSocket 网关架构

### 决策：独立 WebSocket 服务 + y-websocket + Redis Pub/Sub

### 理由

1. **关注点分离**：Hono 优势在于边缘计算和轻量 HTTP，而非长连接；WebSocket 交给独立服务处理更合理。
2. **水平扩展**：使用 Redis Pub/Sub 连接多个 `y-websocket` 实例，实现跨节点消息分发。
3. **官方推荐架构**：`@y/hub` 提供可扩展替代后端，或使用 Redis Pub/Sub 连接多个 y-websocket 实例。

### 架构图

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
    ┌─────▼─────┐      ┌─────▼─────┐      ┌─────▼─────┐
    │  Hono     │      │  Hono     │      │  Hono     │
    │  (HTTP)   │      │  (HTTP)   │      │  (HTTP)   │
    └───────────┘      └───────────┘      └───────────┘

    ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
    │ WS Server 1 │◄────►│   Redis     │◄────►│ WS Server 2 │
    │ (y-websocket)│     │  Pub/Sub   │      │ (y-websocket)│
    └─────────────┘      └─────────────┘      └─────────────┘
```

---

## 5. 文件存储方案

### 决策：RustFS 对象存储 + Presigned URL 模式

### 理由

1. **RustFS 高性能**：Rust 原生实现，高性能低延迟，适合大文件存储场景。
2. **Presigned URL 模式**：Hono 仅处理元数据和签名，大文件直接上传到 RustFS，避免流经 Hono 服务。
3. **独立文件服务**：资源管理（配额、清理）与核心业务分离，可以独立扩展和优化大文件传输。
4. **50MB 单文件限制**：满足项目需求，支持扩展。

### RustFS 核心特性

基于官网（rustfs.com）和 GitHub 仓库（github.com/rustfs/rustfs，26.1k stars，Apache-2.0）信息：

- **高性能**：4KB 对象性能优秀，零 GC 最大吞吐量
- **100% S3 兼容**：现有 S3 客户端工具可直接接入，迁移成本低
- **分布式架构**：跨云分布式对象存储，TB 到 EB 级别，支持多节点水平扩展
- **数据安全**：Bitrot 保护、对象版本控制、WORM 合规、跨地域主动复制
- **密钥集成**：集成 RustyVault 加密，支持端到端加密存储
- **多租户支持**：内置多租户隔离，适合企业级部署
- **运维友好**：Kubernetes Helm Charts 支持，部署自动化程度高

### 规模依据

系统规模目标（NFR-005）定义：至少 1000 并发用户、至少 100,000 个文档、API 至少 500 QPS。

**数据分层存储说明**：
- **PostgreSQL（Drizzle ORM）**：存储 Document 元数据记录（id、title、ownerId、parentFolderId、createdAt、updatedAt），单个文档的 CRDT 内容以 jsonb 形式存储。100,000 个 Document 记录在 PostgreSQL 中完全可管理，必要索引（ownerId、parentFolderId）建好后，文件列表查询 < 200ms。
- **RustFS 对象存储**：通过 Presigned URL 存储实际文件资产（用户上传的 Markdown 源文件、图片等资源）。每个文档可关联多个资源文件，但资源数量与文档数量为独立维度。RustFS 分布式架构支持 TB~EB 级别，100,000 个文档及其关联资源的元数据查询压力由 PostgreSQL 承担，RustFS 仅负责大文件吞吐。

**100,000 文档取值依据**：取自主流 SaaS 协作工具（Notion、Confluence、GitBook）的小型部署基准，面向中小型团队/项目组场景，支持产品初期增长。

**RustFS 选型依据**：RustFS 高性能、100% S3 兼容、Apache 2.0 许可证、AI/ML 数据管道和企业数据湖场景验证，适合本项目的文件资产存储需求。

- 官网：https://rustfs.com
- GitHub：https://github.com/rustfs/rustfs

### 替代方案

| 方案 | 被否定理由 |
|------|-----------|
| 数据库 BLOB | 不适合大文件，备份困难 |
| 直接上传到服务器 | 难以控制上传大小、安全性低 |

---

## 6. PostgreSQL + Redis 持久化策略

### 决策：PostgreSQL (Drizzle ORM) + Redis 分层缓存

### 理由

1. **Drizzle + PostgreSQL**：
   - Drizzle 输出精确 1 条 SQL，适合 serverless 环境
   - 支持 `jsonb` 类型存储 CRDT 状态
   - 类型安全，支持 schema migration
2. **Redis 缓存策略**：
   - 协作会话状态缓存：`collab:${docId}:state`，TTL 1 小时
   - 在线用户列表：`collab:${docId}:users`，TTL 5 分钟
   - JWT 刷新令牌：`session:${userId}`，TTL 15 分钟
   - API 速率限制：`ratelimit:${ip}`，TTL 1 分钟

### 文档 CRDT 状态存储设计

```typescript
// Drizzle schema: 文档内容以 jsonb 存储 CRDT 状态
export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  ownerId: text('owner_id').references(() => users.id),
  content: jsonb('content'),       // CRDT Y.Doc 序列化状态
  version: text('version').notNull(), // 向量时钟版本
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

---

## 7. React i18n 国际化方案

### 决策：react-i18next

### 理由

1. **生态系统成熟**：React 生态中最广泛使用的 i18n 库，拥有最大的社区和最完善的文档。
2. **SSR 支持完善**：支持 React Server Components，服务端渲染时的语言检测。
3. **动态语言切换**：支持运行时切换语言，无需刷新页面。
4. **类型安全**：完整的 TypeScript 类型定义。

### 替代方案

| 方案 | 被否定理由 |
|------|-----------|
| lingui | 社区相对较小，文档不如 react-i18next 完善 |
| next-intl | 专为 Next.js 设计，与 Vite Plus 不兼容 |

---

## 8. React PWA 方案

### 决策：vite-plugin-pwa

### 理由

1. **VitePlus 兼容**：`vite-plugin-pwa` 通过 pnpm overrides (`vite` → `@voidzero-dev/vite-plus-core`) 与 VitePlus/Rolldown 兼容。
2. **React 19 兼容**：积极维护，支持最新的 VitePlus (Vite 8) 版本，与 React 19 无兼容性问题。
3. **离线缓存策略**：内置多种缓存策略（StaleWhileRevalidate、CacheFirst 等），支持 Workbox，提供细粒度的缓存控制。
4. **PWA 安装提示**：自动生成 Web App Manifest，支持安装横幅（InstallPrompt），iOS Safari PWA 支持完善。

### 替代方案

| 方案 | 被否定理由 |
|------|-----------|
| next-pwa | 专为 Next.js 设计，与 Vite Plus 不兼容 |

---

## 9. 技术选型总结

| 技术领域 | 推荐方案 | 关键优势 |
|----------|----------|----------|
| Markdown 编辑器 | CodeMirror 6 | Yjs 原生集成、轻量级、协作优先 |
| 实时协作库 | Yjs + y-websocket | 生产就绪、CRDT 离线支持、成熟生态 |
| 认证 | Custom JWT + jose | 轻量、跨运行时、成熟稳定 |
| WebSocket | 独立 y-websocket + Redis Pub/Sub | 官方方案、可水平扩展 |
| 文件存储 | RustFS 对象存储 + Presigned URL | 高性能 Rust 实现、避免大文件流经 API |
| 持久化 | PostgreSQL (Drizzle) + Redis | 关系型 + 缓存分层 |
| i18n | react-i18next | 生态成熟、SSR 完善、类型安全 |
| PWA | vite-plugin-pwa | Vite 官方、React 19 兼容、Workbox 集成 |

### 关键设计原则

1. **关注点分离**：HTTP API (Hono) 与 WebSocket 独立服务分离
2. **缓存分层**：Redis 处理高频读写，PostgreSQL 处理持久化
3. **最小依赖**：避免使用维护状态不稳定的库
4. **水平扩展**：所有组件设计时考虑分布式部署
