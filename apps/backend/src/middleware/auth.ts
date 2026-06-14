import type { Context, Next } from 'hono';
import * as jose from 'jose';

const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret || _jwtSecret.length < 32) {
  throw new Error('JWT_SECRET environment variable must be set (>= 32 characters)');
}
const JWT_SECRET = new TextEncoder().encode(_jwtSecret);
const JWT_REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET || _jwtSecret
);

export interface JWTPayload {
  sub: string; // user ID
  exp: number;
  iat: number;
  type: 'access' | 'refresh';
}

export interface AuthContext {
  user: {
    id: string;
  };
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization header missing or invalid',
        },
      },
      401
    );
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token);
    c.set('user', { id: payload.sub });
    await next();
  } catch (err) {
    return c.json(
      {
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Access token has expired',
        },
      },
      401
    );
  }
}

export async function signAccessToken(userId: string, sessionId?: string): Promise<string> {
  const jwt = await new jose.SignJWT({ sub: userId, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_SECRET);

  return jwt;
}

export async function signRefreshToken(userId: string): Promise<string> {
  const jwt = await new jose.SignJWT({ sub: userId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_REFRESH_SECRET);

  return jwt;
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET);

  if (payload.type !== 'access') {
    throw new Error('Invalid token type');
  }

  return payload as unknown as JWTPayload;
}

export async function verifyRefreshToken(token: string): Promise<JWTPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_REFRESH_SECRET);

  if (payload.type !== 'refresh') {
    throw new Error('Invalid token type');
  }

  return payload as unknown as JWTPayload;
}

import { createHash, randomBytes } from 'node:crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

export interface BindingFingerprint {
  platform: string;
  cores: number;
  screen: string;
  timezone: string;
  language: string;
  deviceId: string;
}

export function validateBinding(
  stored: { bindingPlatform: string | null; bindingCores: number | null },
  fingerprint: BindingFingerprint
): boolean {
  if (stored.bindingPlatform !== fingerprint.platform) return false;
  if (stored.bindingCores !== fingerprint.cores) return false;
  return true;
}

export function hashBinding(fingerprint: BindingFingerprint): string {
  const raw = `${fingerprint.platform}|${fingerprint.cores}|${fingerprint.screen}|${fingerprint.timezone}|${fingerprint.language}|${fingerprint.deviceId}`;
  return createHash('sha256').update(raw).digest('hex');
}

export async function internalAuthMiddleware(c: Context, next: Next) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || secret.length < 16) {
    return c.json({ success: false, error: { code: 'CONFIG_ERROR', message: 'INTERNAL_API_SECRET not configured' } }, 500);
  }
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || token !== secret) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Internal access only' } }, 401);
  }
  return next();
}
