import type { FullConfig } from '@playwright/test';
import { cleanupTestData } from './test-cleanup.js';

/**
 * Global teardown — runs once after all E2E tests complete.
 *
 * Responsibilities:
 * 1. Clean up test data created during this run
 * 2. Provide a clean state for the next run
 *
 * Per-test cleanup via API fixtures handles the happy path, but crashed
 * or skipped tests leave orphans. This global cleanup is the safety net.
 */
async function globalTeardown(_config: FullConfig) {
  console.log('[global-teardown] E2E test run complete.');
  try {
    await cleanupTestData();
  } catch (e) {
    console.warn('[global-teardown] Cleanup failed (non-fatal):', (e as Error).message);
  }
}

export default globalTeardown;
