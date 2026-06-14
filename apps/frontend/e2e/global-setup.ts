import type { FullConfig } from '@playwright/test';
import { cleanupTestData } from './test-cleanup.js';

/**
 * Global setup — runs once before all E2E tests.
 *
 * Responsibilities:
 * 1. Clean up test data from previous runs (prevents cross-run contamination)
 * 2. Verify backend API is reachable
 * 3. Ensure test infrastructure (DB, Redis) is healthy
 */
async function globalSetup(_config: FullConfig) {
  const API_BASE = process.env.E2E_API_BASE || 'https://localhost';

  // Accept self-signed certs on localhost.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  // ── Clean up leftover test data from previous runs ──
  // Without this, repeated runs accumulate orphaned users/documents/sessions
  // causing username collisions and auth conflicts.
  try {
    await cleanupTestData();
  } catch (e) {
    console.warn('[global-setup] Cleanup failed (non-fatal):', (e as Error).message);
  }

  // ── Verify backend health ──
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const body = await res.json();
        if (body.status === 'ok' || body.status === 'degraded') {
          healthy = true;
          console.log(`[global-setup] Backend healthy (${body.status})`);
          break;
        }
      }
    } catch {
      // Backend not ready yet
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }

  if (!healthy) {
    console.warn('[global-setup] ⚠️ Backend not reachable — API-dependent tests will fail');
  }

  console.log('[global-setup] Complete');
}

export default globalSetup;
