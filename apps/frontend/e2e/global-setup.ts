import type { FullConfig } from '@playwright/test';

/**
 * Global setup — runs once before all E2E tests.
 *
 * Responsibilities:
 * 1. Verify backend API is reachable
 * 2. Ensure test infrastructure (DB, Redis) is healthy
 * 3. Seed any base data needed across all specs
 */
async function globalSetup(_config: FullConfig) {
  const API_BASE = process.env.E2E_API_BASE || 'https://localhost';

  // Accept self-signed certs on localhost.
  // Node's built-in fetch uses undici and does NOT accept https.Agent.
  // NODE_TLS_REJECT_UNAUTHORIZED is the only portable way with native fetch.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
