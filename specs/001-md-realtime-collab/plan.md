# 实施计划：在线实时 Markdown 协同编辑系统

**分支**：`001-md-realtime-collab` | **日期**：2026-04-18 | **规格**：[spec.md](./spec.md)

## 摘要

构建一个支持多人实时协同编辑的在线 Markdown 文档系统。用户可以创建、编辑、分享 Markdown 文件，并通过 WebSocket 实现毫秒级实时同步。使用 Yjs CRDT 处理冲突，CodeMirror 6 作为编辑器，Hono 作为后端 API 框架。

## 技术上下文

**语言/版本**：TypeScript 5.x
**主要依赖**：React 19、Hono、Drizzle ORM、Yjs、CodeMirror 6、PostgreSQL、Redis
**存储**：PostgreSQL（文档元数据 + CRDT 状态）、RustFS 对象存储（文件资产）
**测试**：Vitest + Testing Library
**目标平台**：Web 浏览器（桌面 + 移动响应式）
**项目类型**：Web 应用（前端 + 后端 + WebSocket 协作服务）
**性能目标**：API 响应 < 200ms、协作同步 < 3 秒、500 QPS
**约束条件**：PWA 支持、WCAG AA 可访问性、离线编辑支持
**规模/范围**：1000 并发用户、10 万文档、50MB 最大文件

## 章程合规检查

*GATE: 必须在 Phase 0 研究前通过。Phase 1 设计后重新检查。*

| # | 章程原则 | 合规要求 | 状态 |
|---|---------|---------|------|
| I | Monorepo + pnpm | 项目使用 pnpm workspace 建立 monorepo，前后端分离工作区 | ✅ 合规 |
| II | React 编译优化 | 使用 React Compiler 优化 React 代码，所有组件为函数式 + Hooks | ✅ 合规 |
| III | Drizzle ORM | 所有数据库操作通过 Drizzle ORM，无裸 SQL；用户输入用 Zod 验证 | ✅ 合规 |
| IV | API 规范与错误处理 | 所有 API 满足 OpenAPI 规范，统一错误格式 {code, message, details}，使用 Conventional Commits | ✅ 合规 |
| V | 前端安全/可访问性/测试 | OWASP Top Ten、WCAG AA、Vitest + Testing Library 组件测试 | ✅ 合规 |

**Gate 结果**：全部通过，无需豁免。

## 项目结构

### 文档（功能内）

```text
specs/001-md-realtime-collab/
├── plan.md              # 本文件
├── research.md          # Phase 0 输出
├── data-model.md        # Phase 1 输出
├── quickstart.md        # Phase 1 输出
├── contracts/           # Phase 1 输出
│   └── api-endpoints.md
└── tasks.md             # Phase 2 输出 (/speckit.tasks 命令创建)
```

### 源代码（仓库根目录）

```text
apps/
├── frontend/           # React 19 前端应用
│   ├── src/
│   │   ├── components/    # UI 组件（函数式）
│   │   ├── pages/        # TanStack Router 页面
│   │   ├── hooks/         # 自定义 Hooks（共享）
│   │   ├── services/      # TanStack Query API 调用
│   │   ├── i18n/          # react-i18next 配置
│   │   ├── stores/        # 状态管理
│   │   └── utils/         # 工具函数
│   ├── public/
│   │   ├── manifest.json   # PWA manifest
│   │   └── sw.js          # Service Worker
│   └── tests/
│       └── components/    # Vitest + Testing Library 组件测试
│
├── backend/           # Hono 后端 API
│   ├── src/
│   │   ├── routes/        # API 路由（OpenAPI）
│   │   ├── services/      # 业务逻辑层
│   │   ├── repositories/  # Drizzle 数据访问层
│   │   ├── middleware/    # JWT 认证、CORS、Zod 验证
│   │   ├── db/            # Drizzle schema + migration
│   │   └── utils/         # 工具函数
│   └── tests/
│       └── unit/         # Vitest 单元测试
│
└── ws-server/         # y-websocket 独立协作服务
    └── src/
        └── index.ts       # WebSocket 服务器入口

packages/
├── shared/            # 前后端共享代码
│   └── src/
│       ├── entities/     # 数据实体 TypeScript 类型
│       ├── contracts/    # API 请求/响应类型
│       ├── validators/    # Zod schemas
│       └── utils/        # 共享工具函数
│
└── ui/               # 共享 shadcn/ui 组件库
    └── src/
        └── components/   # 可复用 UI 组件
```

**结构决策**：三项目 monorepo（apps/frontend、apps/backend、apps/ws-server）+ packages/shared + packages/ui。符合章程 I 的 monorepo 要求，Clean Architecture 用于 backend 分层。

---

## Phase 0: 研究

### 技术选型决策（来自 research.md）

| 领域 | 决策 | 理由 |
|------|------|------|
| Markdown 编辑器 | CodeMirror 6 | Yjs 原生集成、协作优先、轻量 |
| 实时协作库 | Yjs + y-websocket | CRDT、生产就绪、离线支持完善 |
| 认证方案 | Custom JWT + jose | Hono 原生集成、跨运行时、成熟稳定 |
| WebSocket 架构 | 独立 y-websocket 服务 + Redis Pub/Sub | 关注点分离、水平扩展 |
| 文件存储 | RustFS 对象存储 + Presigned URL | Rust 原生高性能、避免大文件流经 API |
| 数据库持久化 | PostgreSQL jsonb 存储 CRDT 状态 + Redis 分层缓存 | Drizzle ORM 支持 jsonb |
| i18n | react-i18next | 生态最成熟、SSR 支持完善 |
| PWA | vite-plugin-pwa | Vite 官方插件、React 19 兼容 |

**无 NEEDS CLARIFICATION 标记**：所有技术选型已通过研究确认。

---

## Phase 1: 数据建模与接口契约

### 数据模型（data-model.md）

已创建 `data-model.md`，包含 8 个实体的完整定义：
- User、Session、Document、Folder、Contact、ContactInvitation、Permission、Notification

包含字段类型、约束、验证规则和索引设计。

### 接口契约（contracts/api-endpoints.md）

已创建 OpenAPI 3.1.0 格式的 API 端点文档，涵盖：
- 认证 API（注册/登录/刷新/登出/密码重置）
- 用户资料 API
- 文档管理 API（含移动/复制操作）
- 文件夹管理 API
- 联系人管理 API（含邀请流程）
- 权限管理 API（批量授予/撤销）
- 通知 API
- 搜索 API（含速率限制）
- WebSocket 协作协议

### 快速入门（quickstart.md）

已创建本地开发环境配置指南，包含 Docker 启动、数据库初始化、环境变量配置和常用命令。

---

## 复杂度跟踪

> **仅在章程检查有违规项时填写**

| 违规项 | 原因 | 被否定的更简单方案 |
|--------|------|------------------|
| 无 | 所有设计均符合章程原则 | — |

---

## 后续步骤

Phase 1 已完成，以下工件已生成：
- `research.md` ✅
- `data-model.md` ✅
- `contracts/api-endpoints.md` ✅
- `quickstart.md` ✅

下一步执行 `/speckit.tasks` 生成细粒度任务列表。
