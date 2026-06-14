# 任务列表：在线实时 Markdown 协同编辑系统

**输入**：设计文档（plan.md、spec.md、data-model.md、contracts/api-endpoints.md）
**前提条件**：plan.md（必填）、spec.md（必填，用于用户故事优先级）
**测试**：示例中包含测试任务，仅在明确请求时包含

## 格式说明

- **[P]**：可并行执行（不同文件，无依赖）
- **[Story]**：所属用户故事（例如 [US1]、[US2]）
- 文件路径基于 plan.md 中定义的项目结构

## 阶段依赖关系

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundational) ── 阻塞所有用户故事
    │
    ├──► Phase 3 [US1] 认证
    │         │
    │         └──► Phase 7 [US4] 联系人 ──► Phase 8 [US6] 用户设置
    │
    ├──► Phase 4 [US3] 文件管理
    │         │
    │         └──► Phase 6 [US5] 权限管理（依赖 US3 的文档存在）
    │
    └──► Phase 5 [US2] 协作编辑（与 US3/US5 并行）
              │
              └──► Phase 7 [US4] 联系人
                        │
                        ▼
                   Phase 9 (Polish)
```

## Phase 1：项目初始化（共享基础设施）

**目的**：建立 monorepo 结构、pnpm workspace、工具链配置

- [x] T001 [P] 初始化 pnpm monorepo，创建 `pnpm-workspace.yaml`，声明 `apps/frontend`、`apps/backend`、`apps/ws-server`、`packages/shared`、`packages/ui` 工作区
- [x] T002 [P] 在 `apps/frontend/` 初始化 Vite Plus + React 19 + TypeScript 项目，配置 React Compiler (babel-preset-react-compiler)
- [x] T003 [P] 在 `apps/backend/` 初始化 Hono + TypeScript 项目
- [x] T004 [P] 在 `apps/ws-server/` 初始化 Node.js + TypeScript 项目（y-websocket 服务器）
- [x] T005 [P] 在 `packages/shared/` 初始化共享类型包
- [x] T006 [P] 在 `packages/ui/` 初始化 shadcn/ui 组件库包
- [x] T007 安装所有依赖：frontend、backend、ws-server、shared、ui
- [x] T008 配置 ESLint + Prettier + TypeScript 项目引用（`tsconfig.json` references）
- [x] T009 配置 `vite-plugin-pwa` 和 `react-i18next` 到 frontend
- [x] T010 创建 `docker-compose.yml`：PostgreSQL 16、Redis 7、RustFS（用于对象文件存储）
- [x] T011 创建 `apps/frontend/.env.example` 和 `apps/backend/.env.example`

**检查点**：monorepo 可构建，所有工作区相互引用正确

---

## Phase 2：基础设施层（阻塞所有用户故事）

**目的**：所有用户故事依赖的核心基础设施——数据库 schema、认证中间件、共享类型

### 数据库与 Drizzle ORM

- [x] T012 [P] 在 `apps/backend/src/db/` 创建 Drizzle schema：`users`、`sessions`、`password_reset_tokens`、`documents`、`folders`、`contacts`、`contact_invitations`、`permissions`、`notifications`
- [x] T013 [P] 在 `packages/shared/src/entities/` 创建所有实体的 TypeScript 类型定义（含 PasswordResetToken，对应 data-model.md）
- [x] T014 配置 Drizzle config，连接到 PostgreSQL（`DATABASE_URL`）
- [x] T015 执行 `pnpm db:push` 将 schema 推送到本地数据库

### JWT 认证中间件

- [x] T016 [P] 在 `apps/backend/src/middleware/auth.ts` 创建 JWT 验证中间件（jose 库，access token 15 分钟）
- [x] T017 [P] 在 `apps/backend/src/middleware/rateLimit.ts` 创建速率限制中间件（按用户级别，10 次/分钟）
- [x] T018 [P] 在 `packages/shared/src/validators/` 创建 Zod 验证 schemas（注册、登录、文档操作等）

### Redis 缓存层

- [x] T019 创建 Redis 客户端配置（`apps/backend/src/db/redis.ts`），支持协作会话状态、在线用户列表、JWT 黑名单

**说明**：邀请过期检查采用查询时计算模式（`expiresAt < NOW()` 视为 expired），无需额外定时任务；每次查询邀请列表时过滤过期状态。

### 共享 API 类型

- [x] T020 [P] 在 `packages/shared/src/contracts/` 创建 API 请求/响应 TypeScript 类型（对应 `contracts/api-endpoints.md`）
- [x] T021 [P] 在 `packages/shared/src/i18n/` 创建 react-i18next 命名空间和翻译 key 文件（中英文）
  *（注：以下 T021A 为补充任务，编号在 T021 之后以保持功能相关性）*
- [x] T021A [P] 配置 OpenAPI 文档生成（如 swagger-jsdoc + Scalar），验证所有路由符合 OpenAPI 3.1.0 规范

### 可观测性基础设施（NFR-001~004）

- [x] T022 添加结构化日志中间件（`apps/backend/src/middleware/logger.ts`）：请求ID、用户ID（若已认证）、时间戳、操作类型、耗时；日志格式 JSON
- [x] T023 [P] 添加错误日志中间件：捕获所有未处理异常和被捕获错误，记录错误类型、堆栈跟踪、用户上下文
- [x] T024 [P] 添加性能指标采集：使用 `prom-client` 暴露 /metrics 端点；采集 API 响应时间分布（p50/p95/p99）、协作同步延迟
- [x] T025 [P] 添加分布式追踪：集成 OpenTelemetry 到 Hono 和 y-websocket，为每个请求生成 traceId，通过 Redis context 传播 trace 到 WebSocket 服务

**检查点**：所有 schema 已同步，JWT 中间件可验证 token，Redis 客户端可连接，日志和追踪基础设施就绪

---

## Phase 3：用户故事 1 — 注册与登录（优先级：P1）

**目标**：用户可以注册、登录、单会话强制、密码重置
**独立测试标准**：用户注册后立即登录；同一账户第二设备登录时第一设备会话失效

### 实现

- [x] T026 [P] [US1] 创建 `apps/backend/src/routes/auth.ts`：注册端点 `/api/auth/register`（用户名/邮箱/电话唯一性校验，argon2id 密码哈希，兼容 bcrypt 遗留哈希验证）
- [x] T027 [P] [US1] 创建登录端点 `/api/auth/login`（支持 username/email/phone + 密码）
- [x] T028 [P] [US1] 创建令牌刷新端点 `/api/auth/refresh`（refresh token 7 天）
- [x] T029 [P] [US1] 创建登出端点 `/api/auth/logout`（撤销 refresh token）
- [x] T030 [P] [US1] 创建密码重置请求端点 `/api/auth/password-reset/request`（生成重置令牌）
- [x] T031 [P] [US1] 创建密码重置确认端点 `/api/auth/password-reset/confirm`（验证令牌并更新密码）
- [x] T032 [US1] 实现单会话强制逻辑：新建 Session 时删除该用户所有旧 Session
- [x] T033 [US1] 实现设备会话冲突处理：活跃编辑用户被强制登出前，显示"您的账号已在其他设备登录"的模态框，提示保存未提交变更（本地 IndexedDB 暂存），确认后执行会话切换

### 前端页面

- [x] T034 [P] [US1] 创建 `apps/frontend/src/pages/LoginPage.tsx`：登录表单（支持用户名/邮箱/电话）
- [x] T035 [P] [US1] 创建 `apps/frontend/src/pages/RegisterPage.tsx`：注册表单（用户名/邮箱/电话/密码/确认密码）
- [x] T036 [US1] 创建 `apps/frontend/src/pages/PasswordResetRequestPage.tsx` 和 `PasswordResetConfirmPage.tsx`
- [x] T037 [US1] 配置 TanStack Router 路由：/login、/register、/password-reset

### 测试

- [x] T038 [P] [US1] 创建 Vitest 测试：注册成功/失败场景（用户名重复、邮箱重复、密码不匹配）
- [x] T039 [P] [US1] 创建 Vitest 测试：登录成功/失败场景（错误凭证、账户锁定）
- [x] T040 [US1] 创建 Vitest 测试：单会话强制（第二设备登录后第一设备会话失效）

**检查点**：用户注册 → 登录 → 会话持久化 → 第二设备登录覆盖第一会话

---

## Phase 4：用户故事 3 — 文件与目录管理（优先级：P1）

**目标**：用户可创建/组织/上传/下载/移动/复制/删除文件和目录
**独立测试标准**：用户创建文件后出现在文件树中；上传 50MB 文件成功

### 实现

- [x] T041 [P] [US3] ~~创建文件夹 CRUD 路由和服务~~ **已移除** — folders 功能不再实现（2026-06）
- [x] T042 [P] [US3] 创建文档 CRUD 路由和服务（`apps/backend/src/routes/documents.ts`）
- [x] T043 [P] [US3] ~~实现文档移动端点~~ **已移除** — 随 folders 移除
- [x] T044 [P] [US3] 实现文档复制端点 `/api/documents/:id/copy`
- [x] T045 [US3] 实现文件上传端点 `/api/upload`（RustFS 存储）
- [x] T046 [US3] 实现文件下载端点 `/api/files/:key`（RustFS 取回）
- [x] T047 [US3] ~~实现文件夹删除~~ **已移除** — 随 folders 移除

### 前端

- [x] T048 [P] [US3] ~~创建 FileTree.tsx 可折叠树形侧边栏~~ **已移除** — 随 folders 移除
- [x] T049 [P] [US3] ~~创建 useFileTree.ts 文件树数据获取~~ **已移除** — 随 folders 移除
- [x] T050 [US3] 创建新建文件模态框
- [x] T051 [US3] 创建文件上传组件（拖拽上传、直传 RustFS）
- [x] T052 [US3] 创建文件下载功能

### 测试

- [x] T053 [P] [US3] ~~创建 Vitest 测试：文件夹创建/重命名/删除~~ **已移除** — 随 folders 移除
- [x] T054 [P] [US3] 创建 Vitest 测试：文档创建/复制/删除
- [x] T055 [US3] 创建 Vitest 测试：文件上传成功响应

**检查点**：文件树显示正常；文件创建/移动/复制/删除均立即反映在树中

---

## Phase 5：用户故事 2 — 实时协同 Markdown 编辑（优先级：P1）

**目标**：多人实时编辑、自动保存、多种视图模式
**独立测试标准**：两用户同时编辑同一文档，各自变更在 3 秒内出现在对方屏幕

### WebSocket 协作服务

- [ ] T056 [P] [US2] 在 `apps/ws-server/src/` 创建 y-websocket 服务器入口
- [ ] T057 [P] [US2] 配置 Redis Pub/Sub 连接多个 y-websocket 实例（水平扩展）
- [ ] T058 [P] [US2] 实现权限验证：WebSocket 连接时验证 access token 和文档访问权限
- [ ] T059 [US2] 实现权限变更推送：文档所有者变更某用户权限时，服务器主动推送 `permission-change` 消息给被变更的用户（被降级、撤销或升级者）；消息格式：`{type: "permission-change", data: {level: "read-only | read-write | revoked"}}`

### 后端文档同步

- [ ] T060 [P] [US2] 创建 `/api/documents/:id/sync` 端点（获取/提交 Y.Doc 更新）
- [ ] T061 [US2] PostgreSQL jsonb 字段存储 CRDT 状态，Yjs 序列化后保存

### 前端编辑器

- [x] T062 [P] [US2] ~~安装配置 CodeMirror 6~~ **实现为 Milkdown Crepe 7**（WYSIWYG Markdown 编辑器，基于 ProseMirror）
- [x] T063 [P] [US2] ~~集成 y-codemirror.next~~ **实现为 @milkdown/plugin-collab**（Milkdown + Yjs 绑定）
- [x] T064 [P] [US2] 集成 `y-indexeddb`：离线变更持久化到 IndexedDB
- [x] T065 [US2] 配置 `y-websocket` 客户端：连接到 `ws-server`，实时同步变更（含客户端 syncStep1 发起）
- [x] T065A [US2] WebSocket 连接中 token 自动刷新 + WS 延迟连接到编辑器 onReady 后
- [x] T066 [US2] ~~三种视图模式~~ **实现为 Milkdown Crepe 单视图**（WYSIWYG 编辑 + 实时预览）
- [x] T067 [US2] Markdown 渲染（Milkdown Crepe 内置：表格、任务列表、代码高亮等）
- [x] T068 [US2] 自动保存（每 30 秒间隔保存到后端）
- [ ] T069 [US2] 实现离线编辑（网络断开时本地排队，恢复后同步合并）

### 测试

- [ ] T070 [P] [US2] 创建 Vitest 测试：CodeMirror 初始化和 Markdown 渲染
- [ ] T071 [P] [US2] 创建 Vitest 测试：Yjs 离线变更队列和网络恢复合并
- [ ] T072 [US2] 创建 Vitest 测试：自动保存触发（每 30 秒）

**检查点**：两用户同时编辑，变更 3 秒内同步；网络断开后恢复连接，变更正确合并

---

## Phase 6：用户故事 5 — 文件访问权限管理（优先级：P1）

**目标**：所有者授予/调整/撤销权限，权限变更实时通知
**独立测试标准**：所有者授予只读权限后，联系人无法编辑但可预览

### 实现

- [ ] T073 [P] [US5] 创建权限管理端点：`GET /api/documents/:id/permissions`
- [ ] T074 [P] [US5] 创建批量授予/调整权限端点：`POST /api/documents/:id/permissions`
- [ ] T075 [P] [US5] 创建撤销权限端点：`DELETE /api/documents/:id/permissions/:permissionId`
- [ ] T076 [US5] 权限变更触发通知创建：Permission 表 UPDATE 后在 Service 层同步创建 Notification 记录，通过 WebSocket 推送 `permission-change`
- [ ] T077 [US5] 编辑中途权限撤销/降级：弹窗提示用户保存未提交变更，确认后跳转

### 前端

- [ ] T078 [P] [US5] 创建权限管理面板组件（选择联系人、授予/调整/撤销权限）
- [ ] T079 [US5] 创建权限变更通知横幅组件（权限被变更时弹出）

### 测试

- [ ] T080 [P] [US5] 创建 Vitest 测试：只读权限用户无法调用编辑接口
- [ ] T081 [P] [US5] 创建 Vitest 测试：权限撤销后 WebSocket 收到 `permission-change` 消息
- [ ] T082 [US5] 创建 Vitest 测试：编辑中途权限降级时弹窗出现

**检查点**：权限变更 5 秒内通知到被影响用户；编辑中途权限变更时正确处理

---

## Phase 7：用户故事 4 — 联系人管理（优先级：P2）

**目标**：搜索用户、发送邀请、接受/拒绝、24 小时过期、移除联系人
**独立测试标准**：A 发送邀请给 B，B 在 24 小时内接受，双方联系人列表互相显示对方

### 实现

- [ ] T083 [P] [US4] 创建用户搜索端点 `GET /api/users/search`（支持 username/email/phone，速率限制 10 次/分钟）
- [ ] T084 [P] [US4] 创建邀请发送端点 `POST /api/contacts/invitations`（24 小时过期）
- [ ] T085 [P] [US4] 创建邀请接受/拒绝端点 `POST /api/contacts/invitations/:id/accept|decline`
- [ ] T086 [US4] 实现邀请自动过期逻辑（`expiresAt < NOW()` 视为 expired）
- [ ] T087 [P] [US4] 创建联系人列表端点 `GET /api/contacts`
- [ ] T088 [US4] 创建移除联系人端点 `DELETE /api/contacts/:id`（双向移除）

### 前端

- [ ] T089 [P] [US4] 创建联系人搜索组件（实时搜索，防抖）
- [ ] T090 [P] [US4] 创建邀请管理组件（显示待处理邀请、接受/拒绝按钮）
- [ ] T091 [US4] 创建联系人列表组件
- [ ] T092 [US4] 创建通知铃铛组件（显示新邀请、新权限变更等）

### 测试

- [ ] T093 [P] [US4] 创建 Vitest 测试：邀请发送后 24 小时过期验证
- [ ] T094 [P] [US4] 创建 Vitest 测试：接受邀请后双向添加联系人
- [ ] T095 [US4] 创建 Vitest 测试：拒绝邀请后邀请被删除

**检查点**：搜索 2 秒内返回结果；24 小时过期邀请不可接受

---

## Phase 8：用户故事 6 — 用户资料与设置（优先级：P2）

**目标**：修改用户名/邮箱/电话/密码，主题切换，语言切换
**独立测试标准**：用户修改邮箱后，所有后续 API 调用使用新邮箱验证

### 实现

- [ ] T096 [P] [US6] 创建用户资料端点 `GET /api/users/me` 和 `PATCH /api/users/me`
- [ ] T097 [P] [US6] 创建密码修改端点 `PATCH /api/users/me/password`（验证当前密码）

### 前端

- [ ] T098 [P] [US6] 创建用户设置页面（资料修改表单、密码修改表单）
- [ ] T099 [P] [US6] 创建主题切换组件（浅色/深色，持久化到 localStorage）
- [ ] T100 [P] [US6] 创建语言切换组件（中文/英文，react-i18next）
- [ ] T101 [US6] 整合 TanStack Query 用户数据获取和缓存失效：配置 queryClient 的 queryCache 和 mutationCache，登录/登出时 invalidate 所有用户相关 queries，资料更新时自动更新缓存

### 测试

- [ ] T102 [P] [US6] 创建 Vitest 测试：资料修改成功/失败场景
- [ ] T103 [P] [US6] 创建 Vitest 测试：主题/语言切换后 UI 更新

**检查点**：主题和语言偏好跨会话持久化

---

## Phase 9：完善与跨领域事项

**目的**：影响所有用户故事的全局改进

- [ ] T104 [P] 添加 Docker Compose 优化：分离开发/生产环境配置，添加 healthcheck 和依赖启动顺序
  *（注：FR-026 要求通知永久保留直至手动清除。"手动清除"指用户从 UI 移除通知，不删除数据库记录——通知记录保留供管理员审计。）*
- [ ] T105 [P] 创建通知端点 `GET /api/notifications`、`PATCH /api/notifications/:id/read`、`PATCH /api/notifications/read-all`
- [ ] T106 [P] 创建前端通知中心组件（显示所有通知、标记已读）
- [ ] T107 配置 PWA Service Worker（vite-plugin-pwa）：离线缓存、预缓存
- [ ] T108 添加 PWA 安装提示横幅
- [ ] T109 添加 WCAG AA 可访问性：ARIA 标签、键盘导航（`apps/frontend/src/components/` 所有可交互组件）
- [ ] T110 配置 Vitest + Testing Library 组件测试框架
- [ ] T111 创建所有 shadcn/ui 组件的组件测试（按钮、表单、模态框等）
- [ ] T112 添加 Vitest 单元测试覆盖所有 services 层（auth service、document service 等）
- [ ] T113 配置 Vitest 集成测试（API 端点测试、数据库操作测试）
- [ ] T114 配置 Conventional Commits Git Hook（commit-msg hook）
- [ ] T115 添加 Dockerfile 到 `apps/backend/` 和 `apps/ws-server/`（多阶段构建）
- [ ] T116 添加 Dockerfile 到 `apps/frontend/`（多阶段构建，Nginx Serve）

### 性能验证（NFR-005）

- [ ] T117 [P] 添加负载测试脚本（使用 k6 或 autocannon）：验证 500 QPS 目标、1000 并发用户场景；在 `tests/load/` 目录创建 k6 脚本；验证 SC-004 协作同步性能指标
- [ ] T118 [P] 添加 API 缓存策略（Redis caching for frequent queries）；验证 SC-004 离线变更恢复场景
- [ ] T119A [P] PostgreSQL 文档规模验证：生成 100,000 条 Document 测试记录，验证文件列表查询 < 200ms，检查必要索引（ownerId、parentFolderId、updatedAt）；验证 SC-004 自动保存不丢失数据
- [ ] T119B [P] RustFS 文件资产性能验证：使用 k6 或 autocannon 测试 500 QPS 下的 PUT/GET 性能基线；验证大文件场景下 SC-004 合规性
- [ ] T119C [P] 文件树操作性能验证：创建包含 1000 个节点的目录结构，验证展开/折叠/滚动操作 < 200ms（对应 SC-005）
- [ ] T119D [P] 联系人搜索性能验证：使用 10,000 用户数据集，验证搜索响应 < 2 秒（对应 SC-008）

---

## 依赖关系与执行顺序

### 阶段依赖

- **Phase 1**：无依赖，可立即开始
- **Phase 2**：依赖 Phase 1 完成
- **Phase 3–8**：依赖 Phase 2 完成
- **Phase 9**：依赖 Phase 3–8 全部完成

### 用户故事内部依赖（每个故事内）

1. **路由** → **Service** → **Repository**（自底向上）
2. **前端组件** → **Hooks** → **TanStack Query**（自底向上）

### 可并行机会

- Phase 1 所有 T001–T011 可并行（不同目录）
- Phase 2 中 T012–T021 可并行（schema 和 types 无相互依赖）
- Phase 3–8 中每个故事内的 P 标记任务可并行

---

## MVP 交付策略

**核心 MVP（最小可行产品）**：仅包含 Phase 1 + Phase 2 + Phase 3（US1 认证）

推荐增量交付顺序：

1. **MVP（Phase 1 + 2 + 3）**：用户注册登录系统 ✅
2. **+ Phase 4（US3）**：添加文件管理
3. **+ Phase 5（US2）**：添加协作编辑器
4. **+ Phase 6（US5）**：添加权限管理
5. **+ Phase 7（US4）**：添加联系人
6. **+ Phase 8（US6）**：添加设置
7. **+ Phase 9**：PWA、测试、可访问性、Docker

---

## 任务统计

| 阶段 | 任务数 |
|------|--------|
| Phase 1：初始化 | 11 |
| Phase 2：基础设施 | 15（含 T012-T021, T021A, T022-T025 可观测性） |
| Phase 3：US1 认证 | 15 |
| Phase 4：US3 文件管理 | 15 |
| Phase 5：US2 协作编辑 | 18 |
| Phase 6：US5 权限管理 | 10 |
| Phase 7：US4 联系人 | 13 |
| Phase 8：US6 设置 | 8 |
| Phase 9：完善 | 20（含 T104-T116、T117-T119D） |
| **总计** | **124** |
