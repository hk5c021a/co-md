import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import authRoute from '../../src/routes/auth.js';

// bcrypt — mock password hash used in test data isn't a real argon2id hash
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue('$2b$10$hashed'),
    genSalt: vi.fn().mockResolvedValue('$2b$10$salt'),
  },
}));

// ── Shared test data ──
const mockFingerprint = {
  platform: 'Win32',
  cores: 8,
  screen: '1920x1080',
  timezone: 'UTC',
  language: 'en-US',
  deviceId: 'test-device-1',
};

// ── Hoisted mock data (vi.mock factories are hoisted, so variables they reference
// must be defined via vi.hoisted to avoid TDZ errors). ──
const { hoistedMockUser, hoistedMockSession } = vi.hoisted(() => ({
  hoistedMockUser: {
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com',
    phone: '+8613800138000',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$storedhash',
    pbkdf2Salt: 'co-md-pbkdf2-salt-v1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  hoistedMockSession: {
    id: 'session-1',
    userId: 'test-user-id',
    accessToken: 'mock-access-token',
    refreshTokenHash: 'hashed-refresh',
    tokenFamilyId: 'family-1',
    bindingPlatform: 'Win32',
    bindingCores: 8,
    revoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  },
}));

// ── Mocks ──

// Redis — captcha verification + token ops
vi.mock('../../src/db/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue('42'),       // captcha answer
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
  },
  connectRedis: vi.fn().mockResolvedValue(undefined),
  cacheToken: vi.fn().mockResolvedValue(undefined),
  delTokensByUserId: vi.fn().mockResolvedValue(undefined),
  getTokensByUserId: vi.fn().mockResolvedValue(null),
  getRefreshToken: vi.fn().mockResolvedValue(null),
  setRefreshToken: vi.fn().mockResolvedValue(undefined),
  setOldFamily: vi.fn().mockResolvedValue(undefined),
  blacklistSession: vi.fn().mockResolvedValue(undefined),
  storePasswordResetToken: vi.fn().mockResolvedValue(undefined),
}));

// DB — direct DB queries in /check, register, login, refresh, logout handlers.
// Default mocks return "found" user/session so that login/refresh pass.
// /check with username "newuser" returns null (available).
vi.mock('../../src/db/index.js', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue(hoistedMockUser),
      },
      sessions: {
        findFirst: vi.fn().mockResolvedValue(hoistedMockSession),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
  checkConnection: vi.fn().mockResolvedValue(true),
}));

// Services — business logic layer
vi.mock('../../src/services/index.js', () => ({
  authService: {
    register: vi.fn().mockResolvedValue({
      id: hoistedMockUser.id,
      username: hoistedMockUser.username,
      email: hoistedMockUser.email,
      phone: hoistedMockUser.phone,
      createdAt: hoistedMockUser.createdAt,
      updatedAt: hoistedMockUser.updatedAt,
    }),
    login: vi.fn().mockResolvedValue({
      user: {
        id: hoistedMockUser.id,
        username: hoistedMockUser.username,
        email: hoistedMockUser.email,
        phone: hoistedMockUser.phone,
        createdAt: hoistedMockUser.createdAt,
        updatedAt: hoistedMockUser.updatedAt,
      },
      session: { id: hoistedMockSession.id, expiresAt: hoistedMockSession.expiresAt },
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    }),
    refreshTokens: vi.fn().mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    }),
    logout: vi.fn().mockResolvedValue(undefined),
  },
  AuthError: class AuthError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'AuthError';
      this.code = code;
    }
  },
  userService: {
    getUserByIdentifier: vi.fn().mockImplementation((identifier: string) => {
      if (identifier === 'testuser' || identifier === 'test@example.com' || identifier === '+8613800138000') {
        return Promise.resolve(hoistedMockUser);
      }
      return Promise.resolve(null);
    }),
    existsByUsername: vi.fn().mockResolvedValue(false),
    existsByEmail: vi.fn().mockResolvedValue(false),
    existsByPhone: vi.fn().mockResolvedValue(false),
    existsByIdentifier: vi.fn().mockResolvedValue(true),
  },
  UserError: class UserError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'UserError';
      this.code = code;
    }
  },
  emailService: {
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

// Auth middleware — required by /logout route
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set('user', { id: 'test-user-id', username: 'testuser' });
    await next();
  },
  signAccessToken: vi.fn().mockResolvedValue('mock-signed-access-token'),
  signRefreshToken: vi.fn().mockResolvedValue('mock-signed-refresh-token'),
  verifyAccessToken: vi.fn().mockResolvedValue({ userId: 'test-user-id', iat: Date.now() }),
  verifyRefreshToken: vi.fn().mockResolvedValue({ userId: 'test-user-id', sessionId: 'session-1', familyId: 'family-1' }),
  hashToken: vi.fn().mockReturnValue('hashed-token'),
  validateBinding: vi.fn().mockReturnValue(true),
  JWTPayload: {} as any,
  RefreshTokenPayload: {} as any,
}));

// ── Helpers ──
function createApp() {
  const app = new Hono();
  app.route('/api/auth', authRoute);
  return app;
}

function makeRequest(app: Hono, path: string, options: RequestInit = {}) {
  return app.request(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://localhost',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
}

// Common captcha fields — captcha answer is 42 (mocked redis returns '42')
const validCaptcha = { captchaId: 'test-captcha-id', captchaAnswer: 42 };

// ── Tests ──
describe('Auth Routes Integration', () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('POST /api/auth/register', () => {
    it('should register successfully with valid data', async () => {
      // Register handler checks username, email, phone uniqueness via 3 findFirst calls.
      // All three must return null (user doesn't exist yet).

      const { db } = await import('../../src/db/index.js');
      (db.query.users.findFirst as any)
        .mockResolvedValueOnce(null)  // username check
        .mockResolvedValueOnce(null)  // email check
        .mockResolvedValueOnce(null); // phone check

      const resp = await makeRequest(app, '/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: 'newuser',
          email: 'new@example.com',
          phone: '+8613900139000',
          passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
          confirmPasswordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
          pbkdf2Salt: 'co-md-pbkdf2-salt-v1',
          ...validCaptcha,
        }),
      });

      const data = (await resp.json()) as {
        success: boolean;
        data: { user: { username: string } };
      };
      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.user.username).toBe('newuser');
      const setCookie = resp.headers.get('Set-Cookie') || '';
      expect(setCookie).not.toContain('access_token=');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully and return tokens in JSON body', async () => {
      const resp = await makeRequest(app, '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: 'testuser',
          passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
          fingerprint: mockFingerprint,
          ...validCaptcha,
        }),
      });

      expect(resp.status).toBe(200);
      const data = (await resp.json()) as {
        success: boolean;
        data: { accessToken: string; refreshToken: string };
      };
      expect(data.success).toBe(true);
      expect(data.data.accessToken).toBeDefined();
      expect(data.data.refreshToken).toBeDefined();
      // No cookies set
      const setCookie = resp.headers.get('Set-Cookie') || '';
      expect(setCookie).not.toContain('access_token=');
    });

    it('should reject missing CAPTCHA', async () => {
      const resp = await makeRequest(app, '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: 'testuser',
          passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
          fingerprint: mockFingerprint,
        }),
      });

      const data = (await resp.json()) as {
        success: boolean;
        error: { code: string };
      };
      expect(data.success).toBe(false);
      // Zod validation rejects before reaching CAPTCHA check
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/auth/check', () => {
    it('should check username availability', async () => {
      // Override: return null = username is available
      const { db } = await import('../../src/db/index.js');
      (db.query.users.findFirst as any).mockResolvedValueOnce(null);

      const resp = await makeRequest(app, '/api/auth/check?username=newuser');
      const data = (await resp.json()) as {
        success: boolean;
        data: { usernameTaken: boolean };
      };

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.usernameTaken).toBe(false);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh tokens with token in Authorization header', async () => {
      const resp = await makeRequest(app, '/api/auth/refresh', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-refresh-token',
        },
        body: JSON.stringify({ fingerprint: mockFingerprint }),
      });

      expect(resp.status).toBe(200);
      const data = (await resp.json()) as {
        success: boolean;
        data: { accessToken: string; refreshToken: string };
      };
      expect(data.success).toBe(true);
      expect(data.data.accessToken).toBeDefined();
      expect(data.data.refreshToken).toBeDefined();
    });

    it('should return 401 when no refresh token provided', async () => {
      const resp = await makeRequest(app, '/api/auth/refresh', {
        method: 'POST',
      });

      expect(resp.status).toBe(401);
      const data = (await resp.json()) as {
        success: boolean;
        error: { code: string };
      };
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout when authenticated', async () => {
      const resp = await makeRequest(app, '/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'valid-refresh' }),
      });

      expect(resp.status).toBe(200);
      const data = (await resp.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('should succeed even without body (mock auth middleware always sets user)', async () => {
      const resp = await makeRequest(app, '/api/auth/logout', {
        method: 'POST',
      });

      expect(resp.status).toBe(200);
      const data = (await resp.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });
  });
});
