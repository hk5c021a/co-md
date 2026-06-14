# 快速入门：在线实时 Markdown 协同编辑系统

**日期**：2026-04-18
**对应功能**：`001-md-realtime-collab`

---

## 环境要求

- Node.js 20+
- pnpm 9+
- Docker Desktop（用于 PostgreSQL、Redis）
- Docker Compose

---

## 本地开发环境启动

### 1. 克隆代码库并安装依赖

```bash
git clone <repository-url>
cd co-md
pnpm install
```

### 2. 配置环境变量

```bash
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/backend/.env.example apps/backend/.env.local
```

编辑 `.env.local` 文件，配置以下变量：

```env
# 数据库
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/collab_db

# Redis
REDIS_URL=redis://localhost:6379

# JWT 密钥（生成随机字符串）
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-key-min-32-chars

# 文件存储（RustFS）
RUSTFS_ENDPOINT=http://localhost:9000
RUSTFS_BUCKET=collab-files
RUSTFS_ACCESS_KEY=rustfsadmin
RUSTFS_SECRET_KEY=rustfsadmin

# 邮件服务（SMTP）
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@co-md.local

# 前端
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:4000
```

### 3. 启动基础设施（Docker）

```bash
docker compose up -d postgres redis rustfs
```

等待服务就绪后，创建数据库：

```bash
pnpm db:push
```

### 4. 启动后端

```bash
pnpm --filter backend dev
```

后端运行在 `http://localhost:3000`

### 5. 启动 WebSocket 服务

```bash
pnpm --filter ws-server dev
```

WebSocket 服务运行在 `ws://localhost:4000`

### 6. 启动前端

```bash
pnpm --filter frontend dev
```

前端运行在 `http://localhost:5173`

---

## 首次使用

### 注册账户

1. 打开 `http://localhost:5173`
2. 点击"注册"，填写用户名、邮箱、电话、密码
3. 提交后自动登录，进入工作空间

### 创建文档

1. 点击侧边栏"新建文件"按钮
2. 输入文档标题
3. 编辑器打开后即可开始编辑

### 邀请协作者

1. 打开文档
2. 点击右上角"分享"按钮
3. 搜索联系人用户名/邮箱/电话
4. 选择权限（只读/读写）后发送邀请
5. 对方接受邀请后即可协作编辑

---

## 常用命令

```bash
# 安装依赖
pnpm install

# 数据库 schema 推送（开发）
pnpm db:push

# 数据库迁移（生产）
pnpm db:migrate

# 运行测试
pnpm test

# 运行所有包的类型检查
pnpm typecheck

# 构建生产版本
pnpm build
```

---

## 项目结构

```
apps/
├── frontend/          # React 19 前端应用
│   └── src/
│       ├── components/   # UI 组件
│       ├── pages/        # 页面路由
│       ├── hooks/        # 自定义 Hooks
│       ├── services/     # API 调用
│       ├── i18n/         # 国际化
│       └── stores/       # 状态管理
├── backend/           # Hono 后端 API
│   └── src/
│       ├── routes/       # API 路由
│       ├── services/     # 业务逻辑
│       ├── repositories/ # 数据访问层
│       └── middleware/   # 中间件
└── ws-server/        # y-websocket 协作服务
    └── src/
        └── index.ts

packages/
├── shared/           # 前后端共享代码
│   └── src/
│       ├── entities/    # 数据实体类型
│       ├── contracts/   # API 契约类型
│       └── utils/       # 共享工具
└── ui/              # 共享 UI 组件库
```

---

## 技术栈速查

| 层次 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 后端框架 | Hono |
| 数据库 | PostgreSQL + Drizzle ORM |
| 缓存 | Redis |
| 实时协作 | Yjs + y-websocket |
| Markdown 编辑器 | CodeMirror 6 |
| 文件存储 | RustFS 对象存储（本地开发） |
| 国际化 | react-i18next |
| PWA | vite-plugin-pwa |
| 样式 | Tailwind CSS + shadcn/ui |
| 路由 | TanStack Router |
| 数据获取 | TanStack Query |
