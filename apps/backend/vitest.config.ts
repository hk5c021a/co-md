import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      JWT_SECRET: 'test-secret-with-at-least-32-chars!!',
      JWT_REFRESH_SECRET: 'test-refresh-secret-with-at-least-32-chars!!',
      NODE_ENV: 'test',
    },
    // Unit tests only — integration tests require a running server + database.
    // Run integration tests separately with: vitest run tests/integration/
    exclude: ['tests/integration/**', 'tests/load/**', 'tests/performance/**', 'tests/smoke.test.ts', 'node_modules/**'],
  },
});
