import { test as base } from '@playwright/test';
import { createHash } from 'node:crypto';

// ── API Fixture ──
// Provides backend API access for test data setup/teardown without going through UI.
// Uses Playwright's built-in request context (APIRequestContext).

const API_BASE = process.env.E2E_API_BASE || 'https://localhost';
const API_ORIGIN = API_BASE; // CSRF Origin header — required in production mode
const JSON_HEADERS = { 'Content-Type': 'application/json', Origin: API_ORIGIN };
const MAILPIT_API = 'http://localhost:8025/api/v1';

// ── Node-compatible PBKDF2 prehash (mirrors frontend crypto.ts) ──
// Must match src/lib/crypto.ts — PBKDF2 parameters
const APP_SALT = 'co-md-pbkdf2-salt-v1';
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_KEY_LEN = 32;

async function preHashPassword(password: string, salt = APP_SALT): Promise<string> {
  const { pbkdf2 } = await import('node:crypto');
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, 'sha256', (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString('hex'));
    });
  });
}

// ── Types ──
export interface TestUser {
  username: string;
  email: string;
  phone: string;
  password: string;
}

export interface TestSession {
  user: TestUser;
  userId: string;
  accessToken: string;
  refreshToken: string;
}

// ── Helpers ──
let userCounter = 0;
// Per-process random prefix to avoid collisions between parallel test workers
const WORKER_ID = Math.random().toString(36).slice(2, 6);

function uniqueUser(): TestUser {
  userCounter++;
  // All-digit unique suffix for phone (country code +86, then 11 digits)
  const ts = Date.now();
  const digitSuffix = `${String(ts % 100000).padStart(5, '0')}${String(userCounter).padStart(3, '0')}`;
  const n = `${WORKER_ID}${userCounter}${ts.toString(36).slice(-6)}`;
  return {
    username: `e2e${n}`,
    email: `e2e${n}@test.co-md.local`,
    phone: `+86138${digitSuffix}`.slice(0, 14), // +86 + 11 digits max
    password: 'E2eTestPass123!',
  };
}

// ── API fixture ──
export type ApiFixture = {
  api: {
    register(user?: TestUser): Promise<TestSession>;
    login(identifier: string, password: string): Promise<TestSession>;
    createDocument(token: string, title: string): Promise<string>;
    deleteUser(token: string): Promise<void>;
    healthCheck(): Promise<boolean>;
    /** Request a password reset email (required before calling getPasswordResetToken in production). */
    requestPasswordReset(email: string): Promise<void>;
    /** Get a password-reset token via dev endpoint or Mailpit email extraction. */
    getPasswordResetToken(identifier: string): Promise<string>;
    /** Confirm a password reset with the given token. */
    confirmPasswordReset(token: string, passwordHash: string): Promise<void>;
  };
};

export const test = base.extend<ApiFixture>({
  api: async ({ page }, use) => {
    // Use page.request — inherits ignoreHTTPSErrors from browser context
    const request = page.request;
    const api = {
      async healthCheck(): Promise<boolean> {
        try {
          const r = await request.get(`${API_BASE}/health`);
          return r.ok();
        } catch {
          return false;
        }
      },

      async register(user?: TestUser): Promise<TestSession> {
        const u = user || uniqueUser();
        // Use legacy salt for E2E test registration (API pre-hash mirrors browser PBKDF2)
        const passwordHash = await preHashPassword(u.password);

        // Fetch CAPTCHA for register
        const captchaRes = await request.get(`${API_BASE}/api/auth/captcha`);
        const captchaData = await captchaRes.json();
        if (!captchaData?.success || !captchaData?.data?.captchaId) {
          throw new Error(`CAPTCHA fetch failed: ${JSON.stringify(captchaData)}`);
        }
        const captchaId: string = captchaData.data.captchaId;
        const [ca, cb] = captchaData.data.question.split(/ [×+] /).map((s: string) => parseInt(s.replace(' = ?', ''), 10));
        const captchaAnswer = ca * cb;

        const r = await request.post(`${API_BASE}/api/auth/register`, {
          headers: JSON_HEADERS,
          data: {
            username: u.username,
            email: u.email,
            phone: u.phone,
            passwordHash,
            confirmPasswordHash: passwordHash,
            pbkdf2Salt: 'co-md-pbkdf2-salt-v1',
            captchaId,
            captchaAnswer,
          },
        });

        const body = await r.json();
        if (!r.ok() || !body.success) {
          throw new Error(`Register failed: ${JSON.stringify(body)}`);
        }

        // Login to get tokens (fetches its own CAPTCHA)
        return api.login(u.username, u.password);
      },

      async login(identifier: string, password: string): Promise<TestSession> {
        // Fetch CAPTCHA challenge (mandatory for login)
        const captchaRes = await request.get(`${API_BASE}/api/auth/captcha`);
        const captchaData = await captchaRes.json();
        if (!captchaData?.success || !captchaData?.data?.captchaId) {
          throw new Error(`CAPTCHA fetch failed for login: ${JSON.stringify(captchaData)}`);
        }
        const captchaId: string = captchaData.data.captchaId;
        const [ca, cb] = captchaData.data.question.split(/ [×+] /).map((s: string) => parseInt(s.replace(' = ?', ''), 10));
        const captchaAnswer = ca * cb;

        // Fetch per-user PBKDF2 salt first (mirrors browser login flow)
        let salt = APP_SALT;
        try {
          const saltRes = await request.get(`${API_BASE}/api/auth/salt?identifier=${encodeURIComponent(identifier)}`);
          const saltBody = await saltRes.json();
          if (saltBody?.data?.salt) salt = saltBody.data.salt;
        } catch { /* fall back to legacy salt */ }
        const passwordHash = await preHashPassword(password, salt);

        const r = await request.post(`${API_BASE}/api/auth/login`, {
          headers: JSON_HEADERS,
          data: {
            identifier,
            passwordHash,
            captchaId,
            captchaAnswer,
            fingerprint: {
              platform: 'Test',
              cores: 4,
              screen: '1920x1080',
              timezone: 'UTC',
              language: 'en',
              deviceId: `e2e-device-${Date.now()}`,
            },
          },
        });

        const body = await r.json();
        if (!r.ok() || !body.success) {
          throw new Error(`Login failed: ${JSON.stringify(body)}`);
        }

        return {
          user: {
            username: body.data.user.username,
            email: body.data.user.email,
            phone: body.data.user.phone || '',
            password,
          },
          userId: body.data.user.id,
          accessToken: body.data.accessToken,
          refreshToken: body.data.refreshToken,
        };
      },

      async createDocument(token: string, title: string): Promise<string> {
        const r = await request.post(`${API_BASE}/api/documents`, {
          data: { title },
          headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
        });
        const body = await r.json();
        if (!r.ok() || !body.success) {
          throw new Error(`Create document failed: ${JSON.stringify(body)}`);
        }
        return body.data.id;
      },

      async deleteUser(token: string): Promise<void> {
        // Best-effort cleanup
        try {
          await request.delete(`${API_BASE}/api/users/me`, {
            headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
          });
        } catch (err) {
          console.warn(`[E2E cleanup] Failed to delete user:`, (err as Error).message);
        }
      },

      async requestPasswordReset(email: string): Promise<void> {
        // Fetch CAPTCHA first (mandatory for password reset)
        const captchaRes = await request.get(`${API_BASE}/api/auth/captcha`);
        const captchaData = await captchaRes.json();
        if (!captchaData?.success) throw new Error(`CAPTCHA fetch failed: ${JSON.stringify(captchaData)}`);
        const captchaId: string = captchaData.data.captchaId;
        const [ca, cb] = captchaData.data.question.split(/ [×+] /).map((s: string) => parseInt(s.replace(' = ?', ''), 10));
        const captchaAnswer = ca * cb;

        const r = await request.post(`${API_BASE}/api/auth/password-reset/request`, {
          headers: JSON_HEADERS,
          data: { identifier: email, captchaId, captchaAnswer },
        });
        if (!r.ok()) throw new Error(`Password reset request failed: ${r.status()}`);
      },

      async getPasswordResetToken(identifier: string): Promise<string> {
        // Try dev endpoint first (non-production only)
        const devRes = await request.post(`${API_BASE}/api/auth/password-reset/dev-get-token`, {
          headers: JSON_HEADERS,
          data: { identifier },
        });
        if (devRes.ok()) {
          const body = await devRes.json();
          if (body?.success) return body.data.token;
        }

        // Production fallback: retrieve token from Mailpit
        // Poll Mailpit for the reset email (max 10s)
        for (let i = 0; i < 10; i++) {
          const mpRes = await fetch(`${MAILPIT_API}/messages?limit=10`);
          const mpData = await mpRes.json() as { messages?: Array<{ ID: string; To: Array<{ Address: string }> }> };
          const msg = mpData.messages?.find((m) => m.To?.some((r) => r.Address === identifier));
          if (msg) {
            // Fetch full message to get the HTML body
            const detailRes = await fetch(`${MAILPIT_API}/message/${msg.ID}`);
            const detail = await detailRes.json() as { HTML?: string };
            if (detail.HTML) {
              const match = detail.HTML.match(/\/password-reset\/([a-f0-9-]+)/);
              if (match) return match[1];
            }
            throw new Error(`Reset token not found in email HTML for ${identifier}`);
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        throw new Error(`Password reset email not received for ${identifier} after 10s`);
      },

      async confirmPasswordReset(token: string, passwordHash: string): Promise<void> {
        const r = await request.post(`${API_BASE}/api/auth/password-reset/confirm`, {
          headers: JSON_HEADERS,
          data: { token, passwordHash },
        });
        const body = await r.json();
        if (!r.ok() || !body.success) {
          throw new Error(`Failed to confirm password reset: ${JSON.stringify(body)}`);
        }
      },
    };

    await use(api);

    // No automatic cleanup — each test is responsible for its own data
  },
});

export { expect } from '@playwright/test';
