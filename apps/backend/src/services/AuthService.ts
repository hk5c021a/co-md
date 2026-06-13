import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { userRepository, sessionRepository } from '../repositories/index.js';
import { auditLog } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  validateBinding,
  hashBinding,
  type BindingFingerprint,
} from '../middleware/auth.js';
import {
  setRefreshToken,
  getRefreshToken,
  delRefreshToken,
  setOldFamily,
  getOldFamily,
  setRefreshResult,
  getRefreshResult,
  delTokensByUserId,
  redis,
} from '../db/redis.js';

export interface RegisterData {
  username: string;
  email: string;
  phone: string;
  passwordHash: string;
  pbkdf2Salt: string;
}

export interface LoginData {
  identifier: string;
  passwordHash: string;
  fingerprint: BindingFingerprint;
}

export interface AuthResult {
  user: {
    id: string;
    username: string;
    email: string;
    phone: string;
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    expiresAt: Date;
  };
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  // ── Register — user only, no session, no tokens ──

  async register(data: RegisterData): Promise<{
    id: string;
    username: string;
    email: string;
    phone: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    if (await userRepository.existsByUsername(data.username)) {
      throw new AuthError('USERNAME_TAKEN', 'This username is already taken');
    }
    if (await userRepository.existsByEmail(data.email)) {
      throw new AuthError('EMAIL_TAKEN', 'This email is already registered');
    }
    if (await userRepository.existsByPhone(data.phone)) {
      throw new AuthError('PHONE_TAKEN', 'This phone number is already registered');
    }

    const argon2Hash = await argon2.hash(data.passwordHash, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    const userId = randomUUID();

    try {
      const user = await userRepository.create({
        id: userId,
        username: data.username,
        email: data.email,
        phone: data.phone,
        passwordHash: argon2Hash,
        pbkdf2Salt: data.pbkdf2Salt,
      });

      auditLog('auth.register', { 'audit.user_id': userId });

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
        throw new AuthError('ALREADY_EXISTS', 'Username, email, or phone already registered');
      }
      throw err;
    }
  }

  // ── Login — creates session with token binding ──

  async login(data: LoginData): Promise<AuthResult> {
    const user = await userRepository.findByIdentifier(data.identifier);
    if (!user) {
      auditLog('auth.login_failed', { 'audit.error': 'user_not_found' });
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid username, email, or phone');
    }

    // Check account lockout before expensive Argon2 verification
    const lockKey = `login_attempts:${user.id}`;
    const currentAttempts = parseInt((await redis.get(lockKey)) || '0', 10);
    if (currentAttempts >= 5) {
      throw new AuthError('ACCOUNT_LOCKED', 'Account temporarily locked. Try again in 15 minutes.');
    }

    const isValid = await argon2.verify(user.passwordHash, data.passwordHash);
    if (!isValid) {
      // Track failed attempts in Redis
      const attempts = await redis.incr(lockKey);
      if (attempts === 1) await redis.expire(lockKey, 900); // 15-min window
      auditLog('auth.login_failed', { 'audit.user_id': user.id, 'audit.error': 'invalid_password' });
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid username, email, or phone');
    }

    // Clear lockout counter on successful login
    await redis.del(`login_attempts:${user.id}`);

    // Single session: delete old DB sessions and Redis keys
    await sessionRepository.deleteByUserId(user.id);
    await delTokensByUserId(user.id);

    auditLog('auth.login', { 'audit.user_id': user.id });

    return this.createSession(
      user.id,
      user.username,
      user.email,
      user.phone,
      user.createdAt,
      user.updatedAt,
      data.fingerprint
    );
  }

  // ── Refresh — opaque token lookup + family rotation with replay detection ──

  async refreshTokens(
    oldRefreshToken: string,
    fingerprint: BindingFingerprint
  ): Promise<RefreshResult> {
    const oldHash = hashToken(oldRefreshToken);

    // Look up session by hashed refresh token
    const session = await sessionRepository.findByRefreshTokenHash(oldHash);
    if (!session || session.revoked) {
      throw new AuthError('INVALID_TOKEN', 'Invalid or expired refresh token');
    }

    const { userId, id: sessionId, tokenFamilyId } = session;

    // Check coarse binding (platform + cores)
    if (
      !validateBinding(
        { bindingPlatform: session.bindingPlatform, bindingCores: session.bindingCores },
        fingerprint
      )
    ) {
      throw new AuthError('INVALID_TOKEN', 'Token binding mismatch');
    }

    // Verify full device binding hash (all fingerprint fields)
    if (session.bindingHash && hashBinding(fingerprint) !== session.bindingHash) {
      throw new AuthError('INVALID_TOKEN', 'Token binding mismatch');
    }

    // Check Redis for current family — fallback to DB if evicted
    let currentFamilyId: string | null = (await getRefreshToken(userId, sessionId))?.familyId ?? null;
    if (!currentFamilyId) {
      // Redis evicted — rebuild from DB session
      currentFamilyId = session.tokenFamilyId ?? randomUUID();
      await setRefreshToken(userId, sessionId, currentFamilyId, false);
    }

    const current = await getRefreshToken(userId, sessionId);
    const revoked = current?.revoked ?? false;

    // Check revocation
    if (revoked) {
      throw new AuthError('SESSION_REVOKED', 'Session has been revoked');
    }

    // current should not be null here (we rebuilt it from DB if evicted above)
    if (!current) {
      throw new AuthError('INVALID_TOKEN', 'Session state unavailable');
    }

    // Family ID mismatch — possible replay (use fresh Redis read, not cached value)
    if (tokenFamilyId !== current.familyId) {
      try {
        // Check old family (30s concurrency window)
        const oldFamily = await getOldFamily(userId, sessionId);
        if (oldFamily === tokenFamilyId) {
          // Concurrent retry — return cached result
          const cached = await getRefreshResult(oldHash);
          if (cached) {
            return JSON.parse(cached);
          }
          throw new AuthError('INVALID_TOKEN', 'Token already used, result expired');
        }
      } catch (err) {
        // Redis unavailable — fail closed for security.
        // An attacker could otherwise replay a stolen token during Redis outages.
        logger.error('[auth] Redis unavailable during token refresh replay check', {
          userId,
          sessionId,
          error: (err as Error).message,
        });
        throw new AuthError('SERVICE_UNAVAILABLE', 'Token refresh temporarily unavailable');
      }

      // Real replay — revoke the session
      await setRefreshToken(userId, sessionId, currentFamilyId, true);
      await sessionRepository.revoke(sessionId);
      throw new AuthError('TOKEN_REUSED', 'Token reused — session revoked');
    }

    // Normal rotation
    const newFamilyId = randomUUID();
    const newAccessToken = await signAccessToken(userId, sessionId);
    const newRefreshToken = generateRefreshToken();
    const newHash = hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Persist — write oldFamily BEFORE new family to close TOCTOU replay window
    const result: RefreshResult = { accessToken: newAccessToken, refreshToken: newRefreshToken };
    await setOldFamily(userId, sessionId, currentFamilyId);
    await setRefreshToken(userId, sessionId, newFamilyId, false);
    await setRefreshResult(oldHash, JSON.stringify(result));
    await sessionRepository.updateSession(sessionId, {
      refreshTokenHash: newHash,
      tokenFamilyId: newFamilyId,
      expiresAt,
    });

    return result;
  }

  // ── Logout ──

  async logout(refreshToken: string): Promise<void> {
    try {
      const tokenHash = hashToken(refreshToken);
      const session = await sessionRepository.findByRefreshTokenHash(tokenHash);
      if (session) {
        auditLog('auth.logout', { 'audit.user_id': session.userId });
        await delRefreshToken(session.userId, session.id);
        await sessionRepository.revoke(session.id);
      }
    } catch {
      // Token invalid — nothing to clean up
    }
  }

  // ── Internal: create session with opaque refresh + binding ──

  private async createSession(
    userId: string,
    username: string,
    email: string,
    phone: string,
    createdAt: Date,
    updatedAt: Date,
    fingerprint: BindingFingerprint
  ): Promise<AuthResult> {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const accessToken = await signAccessToken(userId, sessionId);
    const refreshToken = generateRefreshToken();
    const refreshHash = hashToken(refreshToken);
    const bindingHash = hashBinding(fingerprint);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // DB
    await sessionRepository.create({
      id: sessionId,
      userId,
      accessToken,
      refreshTokenHash: refreshHash,
      tokenFamilyId: familyId,
      revoked: false,
      bindingHash,
      bindingPlatform: fingerprint.platform,
      bindingCores: fingerprint.cores,
      expiresAt,
    });

    // Redis
    await setRefreshToken(userId, sessionId, familyId, false);

    auditLog('auth.token_refresh', { 'audit.user_id': userId });

    return {
      user: { id: userId, username, email, phone, createdAt, updatedAt },
      session: { id: sessionId, expiresAt },
      accessToken,
      refreshToken,
    };
  }
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export const authService = new AuthService();
