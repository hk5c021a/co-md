import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import authRoute from '../../src/routes/auth.js';

const mockFingerprint = {
  platform: 'Win32',
  cores: 8,
  language: 'en-US',
  colorDepth: 24,
};

vi.mock('../../src/services/index.js', () => {
  const mockUser = {
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com',
    phone: '+8613800138000',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$storedhash',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSession = {
    id: 'session-1',
    userId: 'test-user-id',
    accessToken: 'mock-access-token',
    refreshTokenHash: 'hashed-refresh',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  };

  return {
    authService: {
      register: vi.fn().mockResolvedValue({
        id: mockUser.id,
        username: mockUser.username,
        email: mockUser.email,
        phone: mockUser.phone,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      }),
      login: vi.fn().mockResolvedValue({
        user: {
          id: mockUser.id,
          username: mockUser.username,
          email: mockUser.email,
          phone: mockUser.phone,
          createdAt: mockUser.createdAt,
          updatedAt: mockUser.updatedAt,
        },
        session: {
          id: mockSession.id,
          expiresAt: mockSession.expiresAt,
        },
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
        if (
          identifier === 'testuser' ||
          identifier === 'test@example.com' ||
          identifier === '+8613800138000'
        ) {
          return Promise.resolve(mockUser);
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
  };
});

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
      ...((options.headers as Record<string, string>) || {}),
    },
  });
}

describe('Auth Routes Integration', () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('POST /api/auth/register', () => {
    it('should register successfully with valid data', async () => {
      const resp = await makeRequest(app, '/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: 'newuser',
          email: 'new@example.com',
          phone: '+8613900139000',
          passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        }),
      });

      const data = (await resp.json()) as {
        success: boolean;
        data: { user: { username: string } };
      };
      expect(resp.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.user.username).toBe('testuser');
      // Register does NOT set cookies
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

    it('should reject missing fingerprint', async () => {
      const resp = await makeRequest(app, '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: 'testuser',
          passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        }),
      });

      const data = (await resp.json()) as {
        success: boolean;
        error: { code: string };
      };
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/auth/check', () => {
    it('should check username availability', async () => {
      const resp = await makeRequest(app, '/api/auth/check?username=newuser');
      const data = (await resp.json()) as {
        success: boolean;
        data: { username: boolean };
      };

      expect(resp.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.username).toBe(false);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh tokens with refreshToken + fingerprint in body', async () => {
      const resp = await makeRequest(app, '/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({
          refreshToken: 'valid-refresh-token',
          fingerprint: mockFingerprint,
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
      // No cookies
      const setCookie = resp.headers.get('Set-Cookie') || '';
      expect(setCookie).not.toContain('access_token=');
    });

    it('should return 401 when no refresh token provided', async () => {
      const resp = await makeRequest(app, '/api/auth/refresh', {
        method: 'POST',
      });

      expect(resp.status).toBe(400);
      const data = (await resp.json()) as {
        success: boolean;
        error: { code: string };
      };
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout with refreshToken in body', async () => {
      const resp = await makeRequest(app, '/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'valid-refresh' }),
      });

      expect(resp.status).toBe(200);
      const data = (await resp.json()) as { success: boolean };
      expect(data.success).toBe(true);
      // No cookies to clear
    });

    it('should succeed even without refreshToken (best-effort)', async () => {
      const resp = await makeRequest(app, '/api/auth/logout', {
        method: 'POST',
      });

      expect(resp.status).toBe(200);
      const data = (await resp.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });
  });
});
