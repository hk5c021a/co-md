import { defineConfig, devices } from '@playwright/test';

// ── E2E Configuration ──
// Runs against the production docker stack (Caddy → backend).
// Prerequisite: docker compose --env-file .env.prod.local -f docker-compose.yml -f docker-compose.prod.yml up -d
//
// NOTE: E2E tests that use the password-reset dev-get-token endpoint require
// the backend to run with ALLOW_DEV_ENDPOINTS=true. Add this to .env.prod.local
// or docker-compose.prod.yml backend environment before running E2E tests.
// DO NOT set this in true production deployments.
//
// See: https://playwright.dev/docs/test-configuration

const BASE_URL = 'https://localhost';

export default defineConfig({
  // ── Test directory ──
  testDir: './specs',
  testMatch: '**/*.spec.ts',

  // ── Parallelism ──
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,

  // ── Retries ──
  retries: process.env.CI ? 2 : 1,

  // ── Reporter ──
  reporter: [
    ['html', { outputFolder: '../../reports/e2e-html', open: 'never' }],
    ['list'],
    ['json', { outputFile: '../../reports/e2e-results.json' }],
  ],

  // ── Global timeout ──
  timeout: 30_000,
  expect: { timeout: 10_000 },

  // ── Shared settings ──
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: ['--ignore-certificate-errors', '--ignore-certificate-errors-spki-list'],
    },
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
    locale: 'en-US',
    timezoneId: 'UTC',
  },

  // ── Browser projects ──
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1440, height: 900 },
      },
    },

    // Mobile viewport (chromium only — covers responsive + touch)
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 412, height: 915 },
      },
    },

    // Mobile Safari (iOS) — covers PWA standalone mode + WebKit quirks
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 14'],
      },
    },
  ],

  // ── Global setup / teardown ──
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
});
