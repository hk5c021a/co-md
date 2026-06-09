import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService, AuthError } from '../../src/services/AuthService.js';

// Use vi.hoisted so mock factories can reference these at hoist time
const {
  mockCreate,
  mockDeleteByUserId,
  mockRevoke,
  mockUpdateSession,
  mockFindByRefreshTokenHash,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockDeleteByUserId: vi.fn(),
  mockRevoke: vi.fn(),
  mockUpdateSession: vi.fn(),
  mockFindByRefreshTokenHash: vi.fn(),
}));

const {
  mockRedisGetRefreshToken,
  mockRedisSetRefreshToken,
  mockRedisDelRefreshToken,
  mockRedisGetOldFamily,
  mockRedisSetOldFamily,
  mockRedisGetRefreshResult,
  mockRedisSetRefreshResult,
  mockRedisDelTokensByUserId,
  mockRedisIncr,
  mockRedisExpire,
  mockRedisDel,
  mockRedisGet,
} = vi.hoisted(() => ({
  mockRedisGetRefreshToken: vi.fn(),
  mockRedisSetRefreshToken: vi.fn(),
  mockRedisDelRefreshToken: vi.fn(),
  mockRedisGetOldFamily: vi.fn(),
  mockRedisSetOldFamily: vi.fn(),
  mockRedisGetRefreshResult: vi.fn(),
  mockRedisSetRefreshResult: vi.fn(),
  mockRedisDelTokensByUserId: vi.fn(),
  mockRedisIncr: vi.fn().mockResolvedValue(1),
  mockRedisExpire: vi.fn().mockResolvedValue(true),
  mockRedisDel: vi.fn().mockResolvedValue(1),
  mockRedisGet: vi.fn().mockResolvedValue(null), // null = no lockout
}));

// Mock argon2
vi.mock('argon2', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$argon2id$mockhash'),
    verify: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../src/repositories/index.js', () => ({
  userRepository: {
    existsByUsername: vi.fn(),
    existsByEmail: vi.fn(),
    existsByPhone: vi.fn(),
    findByIdentifier: vi.fn(),
    findById: vi.fn(),
    create: mockCreate,
  },
  sessionRepository: {
    deleteByUserId: mockDeleteByUserId,
    findByUserId: vi.fn(),
    findByRefreshTokenHash: mockFindByRefreshTokenHash,
    create: vi.fn(),
    updateSession: mockUpdateSession,
    revoke: mockRevoke,
  },
}));

vi.mock('../../src/db/redis.js', () => ({
  setRefreshToken: (...args: unknown[]) => mockRedisSetRefreshToken(...args),
  getRefreshToken: (...args: unknown[]) => mockRedisGetRefreshToken(...args),
  delRefreshToken: (...args: unknown[]) => mockRedisDelRefreshToken(...args),
  setOldFamily: (...args: unknown[]) => mockRedisSetOldFamily(...args),
  getOldFamily: (...args: unknown[]) => mockRedisGetOldFamily(...args),
  setRefreshResult: (...args: unknown[]) => mockRedisSetRefreshResult(...args),
  getRefreshResult: (...args: unknown[]) => mockRedisGetRefreshResult(...args),
  delTokensByUserId: (...args: unknown[]) => mockRedisDelTokensByUserId(...args),
  redis: {
    incr: (...args: unknown[]) => mockRedisIncr(...args),
    expire: (...args: unknown[]) => mockRedisExpire(...args),
    del: (...args: unknown[]) => mockRedisDel(...args),
    get: (...args: unknown[]) => mockRedisGet(...args),
  },
}));

// Mock auth middleware
vi.mock('../../src/middleware/auth.js', () => ({
  signAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
  generateRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
  hashToken: vi.fn().mockReturnValue('mock-hash'),
  hashBinding: vi.fn().mockReturnValue('mock-binding-hash'),
  validateBinding: vi.fn().mockReturnValue(true),
}));

import argon2 from 'argon2';
import { userRepository, sessionRepository } from '../../src/repositories/index.js';
import { signAccessToken, generateRefreshToken, hashToken } from '../../src/middleware/auth.js';

const mockFingerprint = {
  platform: 'Win32',
  cores: 8,
  language: 'en-US',
  colorDepth: 24,
};

const mockUser = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  phone: '1234567890',
  passwordHash: '$argon2id$mockhash',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════
  // register
  // ═══════════════════════════════════════════════

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const registerData = {
        username: 'testuser',
        email: 'test@example.com',
        phone: '1234567890',
        passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      };

      vi.mocked(userRepository.existsByUsername).mockResolvedValue(false);
      vi.mocked(userRepository.existsByEmail).mockResolvedValue(false);
      vi.mocked(userRepository.existsByPhone).mockResolvedValue(false);
      mockCreate.mockResolvedValue(mockUser);

      const result = await authService.register(registerData);

      expect(result.username).toBe(registerData.username);
      expect(result.email).toBe(registerData.email);
      expect(result.phone).toBe(registerData.phone);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should throw error when username is taken', async () => {
      vi.mocked(userRepository.existsByUsername).mockResolvedValue(true);

      await expect(
        authService.register({
          username: 'existinguser',
          email: 'test@example.com',
          phone: '1234567890',
          passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        })
      ).rejects.toThrow(AuthError);
    });

    it('should throw error when email is already registered', async () => {
      vi.mocked(userRepository.existsByUsername).mockResolvedValue(false);
      vi.mocked(userRepository.existsByEmail).mockResolvedValue(true);

      await expect(
        authService.register({
          username: 'testuser',
          email: 'existing@example.com',
          phone: '1234567890',
          passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        })
      ).rejects.toThrow('This email is already registered');
    });

    it('should throw error when phone is already registered', async () => {
      vi.mocked(userRepository.existsByUsername).mockResolvedValue(false);
      vi.mocked(userRepository.existsByEmail).mockResolvedValue(false);
      vi.mocked(userRepository.existsByPhone).mockResolvedValue(true);

      await expect(
        authService.register({
          username: 'testuser',
          email: 'test@example.com',
          phone: 'existingphone',
          passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        })
      ).rejects.toThrow('This phone number is already registered');
    });

    it('should throw ALREADY_EXISTS on PG unique violation', async () => {
      vi.mocked(userRepository.existsByUsername).mockResolvedValue(false);
      vi.mocked(userRepository.existsByEmail).mockResolvedValue(false);
      vi.mocked(userRepository.existsByPhone).mockResolvedValue(false);
      const pgError = new Error('duplicate key') as Error & { code: string };
      pgError.code = '23505';
      mockCreate.mockRejectedValue(pgError);

      await expect(
        authService.register({
          username: 'testuser',
          email: 'test@example.com',
          phone: '1234567890',
          passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        })
      ).rejects.toThrow('Username, email, or phone already registered');
    });
  });

  // ═══════════════════════════════════════════════
  // login
  // ═══════════════════════════════════════════════

  describe('login', () => {
    it('should login user successfully with fingerprint', async () => {
      vi.mocked(userRepository.findByIdentifier).mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockResolvedValue(true);
      mockDeleteByUserId.mockResolvedValue(1);

      const result = await authService.login({
        identifier: 'testuser',
        passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        fingerprint: mockFingerprint,
      });

      expect(result.user.username).toBe(mockUser.username);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // Single session: old sessions deleted
      expect(mockDeleteByUserId).toHaveBeenCalledWith(mockUser.id);
      expect(mockRedisDelTokensByUserId).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw error when user not found', async () => {
      vi.mocked(userRepository.findByIdentifier).mockResolvedValue(null);

      await expect(
        authService.login({
          identifier: 'nonexistent',
          passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
          fingerprint: mockFingerprint,
        })
      ).rejects.toThrow('Invalid username, email, or phone');
    });

    it('should throw error when password is incorrect', async () => {
      vi.mocked(userRepository.findByIdentifier).mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockResolvedValue(false);

      await expect(
        authService.login({
          identifier: 'testuser',
          passwordHash: 'wrong-hash',
          fingerprint: mockFingerprint,
        })
      ).rejects.toThrow('Invalid username, email, or phone');
    });
  });

  // ═══════════════════════════════════════════════
  // logout
  // ═══════════════════════════════════════════════

  describe('logout', () => {
    it('should logout user successfully via opaque token lookup', async () => {
      mockFindByRefreshTokenHash.mockResolvedValue({
        id: 'session-123',
        userId: 'user-123',
        refreshTokenHash: 'mock-hash',
        tokenFamilyId: 'fam-1',
        revoked: false,
        bindingHash: 'mock-binding-hash',
        bindingPlatform: 'Win32',
        bindingCores: 8,
        deviceInfo: null,
        expiresAt: new Date(),
        createdAt: new Date(),
      });
      mockRevoke.mockResolvedValue(true);

      await expect(authService.logout('valid-refresh-token')).resolves.not.toThrow();
      expect(mockRedisDelRefreshToken).toHaveBeenCalledWith('user-123', 'session-123');
      expect(mockRevoke).toHaveBeenCalledWith('session-123');
    });

    it('should not throw error when token is invalid', async () => {
      mockFindByRefreshTokenHash.mockResolvedValue(null);

      await expect(authService.logout('invalid-token')).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════
  // refreshTokens
  // ═══════════════════════════════════════════════

  describe('refreshTokens', () => {
    const mockSession = {
      id: 'session-123',
      userId: 'user-123',
      refreshTokenHash: 'old-hash',
      tokenFamilyId: 'fam-old',
      revoked: false,
      bindingHash: 'mock-binding-hash',
      bindingPlatform: 'Win32',
      bindingCores: 8,
      deviceInfo: null,
      expiresAt: new Date(),
      createdAt: new Date(),
    };

    it('should refresh tokens successfully with binding match', async () => {
      mockFindByRefreshTokenHash.mockResolvedValue(mockSession);
      // Current family matches
      mockRedisGetRefreshToken.mockResolvedValue({ familyId: 'fam-old', revoked: false });
      mockUpdateSession.mockResolvedValue({
        id: 'session-123',
        userId: 'user-123',
        refreshTokenHash: 'new-hash',
        tokenFamilyId: 'fam-new',
        revoked: false,
        bindingHash: 'mock-binding-hash',
        bindingPlatform: 'Win32',
        bindingCores: 8,
        deviceInfo: null,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await authService.refreshTokens('valid-refresh-token', mockFingerprint);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockRedisSetRefreshToken).toHaveBeenCalled();
      expect(mockUpdateSession).toHaveBeenCalled();
    });

    it('should throw error when session not found', async () => {
      mockFindByRefreshTokenHash.mockResolvedValue(null);

      await expect(authService.refreshTokens('unknown-token', mockFingerprint)).rejects.toThrow(
        'Invalid or expired refresh token'
      );
    });

    it('should revoke session on familyId mismatch (replay attack)', async () => {
      mockFindByRefreshTokenHash.mockResolvedValue(mockSession);
      // Current Redis family differs
      mockRedisGetRefreshToken.mockResolvedValue({ familyId: 'fam-current', revoked: false });
      mockRedisGetOldFamily.mockResolvedValue(null); // No old family -> real replay

      await expect(authService.refreshTokens('old-refresh-token', mockFingerprint)).rejects.toThrow(
        'Token reused — session revoked'
      );

      // Session revoked in Redis
      expect(mockRedisSetRefreshToken).toHaveBeenCalledWith(
        'user-123',
        'session-123',
        'fam-current',
        true
      );
      expect(mockRevoke).toHaveBeenCalledWith('session-123');
    });

    it('should allow retry within 30s concurrency window (oldFamily match)', async () => {
      mockFindByRefreshTokenHash.mockResolvedValue({
        ...mockSession,
        tokenFamilyId: 'fam-prev',
      });
      // Current family differs
      mockRedisGetRefreshToken.mockResolvedValue({ familyId: 'fam-current', revoked: false });
      // But oldFamily matches -> concurrent retry
      mockRedisGetOldFamily.mockResolvedValue('fam-prev');
      mockRedisGetRefreshResult.mockResolvedValue(
        JSON.stringify({ accessToken: 'cached-at', refreshToken: 'cached-rt' })
      );

      const result = await authService.refreshTokens('concurrent-token', mockFingerprint);
      expect(result.accessToken).toBe('cached-at');
      expect(result.refreshToken).toBe('cached-rt');
    });

    it('should throw error when session is revoked', async () => {
      mockFindByRefreshTokenHash.mockResolvedValue({
        ...mockSession,
        revoked: true,
      });

      await expect(authService.refreshTokens('revoked-token', mockFingerprint)).rejects.toThrow(
        'Invalid or expired refresh token'
      );
    });

    it('should throw error when coarse binding mismatches (platform)', async () => {
      mockFindByRefreshTokenHash.mockResolvedValue(mockSession);
      const differentFingerprint = { ...mockFingerprint, platform: 'MacIntel' };

      // validateBinding returns false
      const { validateBinding } = await import('../../src/middleware/auth.js');
      vi.mocked(validateBinding).mockReturnValueOnce(false);

      await expect(
        authService.refreshTokens('binding-token', differentFingerprint)
      ).rejects.toThrow('Token binding mismatch');
    });

    it('should handle Redis eviction by falling back to DB familyId', async () => {
      mockFindByRefreshTokenHash.mockResolvedValue(mockSession);
      // Redis evicted — getRefreshToken returns null
      mockRedisGetRefreshToken.mockResolvedValueOnce(null);
      // After rebuild from DB, second Redis get succeeds
      mockRedisGetRefreshToken.mockResolvedValueOnce({
        familyId: mockSession.tokenFamilyId,
        revoked: false,
      });
      mockUpdateSession.mockResolvedValue({
        ...mockSession,
        refreshTokenHash: 'new-hash',
        tokenFamilyId: 'fam-new',
      });

      const result = await authService.refreshTokens('evicted-token', mockFingerprint);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // First call was null → should have rebuilt from DB
      expect(mockRedisSetRefreshToken).toHaveBeenCalledWith(
        'user-123',
        'session-123',
        mockSession.tokenFamilyId,
        false
      );
    });
  });
});
