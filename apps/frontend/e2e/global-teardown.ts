import type { FullConfig } from '@playwright/test';

/**
 * Global teardown — 在所有 E2E 测试完成后运行一次。
 *
 * 职责：
 * 1. 清理测试残留数据（通过 API 批量清理）
 * 2. 输出测试摘要
 *
 * 当前为空操作（no-op）的原因：
 * - 每个测试 spec 通过 API fixture 负责清理自己的测试数据
 *   （在测试用例末尾调用 `api.deleteUser()` 等操作）。
 * - 全局 teardown 作为防御性兜底：如果某个测试中途崩溃导致未清理，
 *   此处可以执行批量清理。
 * - Playwright worker 之间隔离，无法跨 worker 共享用户凭证列表。
 * - 每个 worker 在 `api.fixture.ts` 中使用随机前缀生成独立用户，
 *   不存在跨测试的数据冲突。
 * - 后端每日自动清理任务（cleanup.ts）会处理超过 24 小时的
 *   未验证用户和过期会话。
 *
 * 如需启用全局清理，建议方案：
 * 1. 在 global-setup.ts 中创建管理员账号，将凭证写入环境变量
 * 2. 后端提供 `DELETE /api/dev/cleanup-test-data` 管理端点
 *    （仅在 NODE_ENV !== 'production' 时可用）
 * 3. 此处调用该端点批量清理所有 `e2e*` 前缀的用户和文档
 */
async function globalTeardown(_config: FullConfig) {
  console.log('[global-teardown] E2E test run complete.');
  console.log('[global-teardown] Per-test cleanup handled by API fixtures.');
  console.log('[global-teardown] Orphaned data handled by backend daily cleanup task.');
}

export default globalTeardown;
