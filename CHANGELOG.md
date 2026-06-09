# Changelog

## [0.0.3] — 2026-06-07

### Changed

- **构建工具迁移 Vite → VitePlus**: 使用 `vite-plus` (`vp` CLI) 替代 Vite
  - Vite 8 + Rolldown (Rust bundler) 替代 esbuild/Rollup
  - Oxlint (Rust linter, 50–100× 比 ESLint 快) 替代 ESLint
  - Oxfmt (Rust formatter, 30× 比 Prettier 快) 替代 Prettier
  - 统一 CLI: `vp dev` / `vp build` / `vp check` / `vp preview`
  - pnpm overrides: `vite` → `@voidzero-dev/vite-plus-core`
  - 单文件配置: `vite.config.ts` 包含 Vite + Vitest + Oxlint + Oxfmt + staged

## [0.0.2] — 2026-05-28

### Fixed

- 只读用户在编辑器页面不可编辑（编辑器 `editable: false` + 工具栏隐藏 + WS 不发送 + auto-save 跳过）
- 浏览器刷新后不再跳回登录页（Worker `apiBase` 直连 + Redis URL 密码认证）
- 通知即时送达无需手动刷新（`useNotificationSocket` 按类型精准刷新 React Query 缓存）
- 联系人通知缺失 Redis pub/sub（`ContactService` 发布 contact-invitation/contact-added/contact-removed）
- 添加联系人失败无错误提示（`ContactsTab` 添加 `onError` toast）
- 联系人搜索结果排除已是联系人的用户
- 移除联系人时自动撤销对方文档权限，仅发一条统一通知
- 联系人移除通知 i18n 处理（中英文翻译键）
- 权限通知图标按级别区分（只读 `MdVisibility` / 读写 `MdEdit`）
- 权限变更通知类型区分（首次 `permission-granted` / 变更 `permission-changed`）
- 通知点击不再跳转编辑器页面，统一打开通知中心侧栏
- 通知侧栏动画 Firefox 兼容优化（`translate3d` + `backface-visibility`）

### Changed

- API 调用统一通过 `apiClient.ts` 共享模块（`API_BASE` + `apiFetch` + `getWsBase`）
- 移除 Vite dev proxy 配置（Web Worker 不经过 proxy，统一直连）
- 通知类型联合新增 `contact-removed`
- `.env.example` 默认值更新（HTTPS/WSS URL、Redis 密码）

## [0.0.1] — 2026-04-18

### Added

- User registration and login (username / email / phone + password)
- JWT authentication with single-session enforcement and token refresh
- Password reset via email
- Real-time collaborative Markdown editing (Yjs CRDT, Milkdown Crepe WYSIWYG)
- Document management (create, rename, copy, delete, responsive file list / card grid)
- Document-level permission management (read-only / read-write, owner grant / revoke)
- Contact management (user search, invitation accept / decline / auto-expire, bidirectional removal)
- PWA support (offline caching, Yjs IndexedDB persistence, install banner)
- Theme (light / dark / system) and language (zh / en) preferences
- WCAG AA accessibility (ARIA labels, keyboard navigation, skip-to-main)
- Structured JSON logging, prometheus metrics, OpenTelemetry distributed tracing
- Docker Compose infrastructure (PostgreSQL 16, Redis 7, RustFS, Mailpit)
- API load tests (K6) and performance benchmarks (100k documents, 10k users, 500 QPS)

[0.0.2]: https://github.com/co-md/collab-markdown/releases/tag/v0.0.2
[0.0.1]: https://github.com/co-md/collab-markdown/releases/tag/v0.0.1
