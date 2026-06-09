import { Hono } from 'hono';
import type { Context } from 'hono';
import { db } from '../db/index.js';
import { users, sessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../middleware/auth.js';
import { authMiddleware } from '../middleware/auth.js';
import { redis } from '../db/redis.js';
import { emailService } from '../services/EmailService.js';
import { delTokensByUserId, blacklistSession } from '../db/redis.js';

// Local validators for now - will use shared package when import is resolved
const registerSchemaLocal = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  phone: z.string().min(10).max(20),
  passwordHash: z.string().min(32),
  confirmPasswordHash: z.string().min(32),
  pbkdf2Salt: z.string().min(8),
  captchaId: z.string().min(1),
  captchaAnswer: z.number().int().positive(),
}).refine((data) => data.passwordHash === data.confirmPasswordHash, {
  message: 'Passwords do not match',
  path: ['confirmPasswordHash'],
});

const loginSchemaLocal = z.object({
  identifier: z.string().min(1),
  passwordHash: z.string().min(32),
  captchaId: z.string().min(1),
  captchaAnswer: z.number().int().positive(),
});

const refreshTokenSchemaLocal = z.object({
  fingerprint: z.object({
    platform: z.string(),
    cores: z.number().int().positive(),
    screen: z.string(),
    timezone: z.string(),
    language: z.string(),
    deviceId: z.string(),
  }).optional(),
});

const passwordResetRequestSchemaLocal = z.object({
  identifier: z.string().min(1),
  lang: z.string().optional(),
  captchaId: z.string().min(1),
  captchaAnswer: z.number().int().positive(),
});

const passwordResetConfirmSchemaLocal = z.object({
  token: z.string().min(1),
  newPasswordHash: z.string().min(32),
  newPbkdf2Salt: z.string().min(16),
});

const app = new Hono();

// ── CAPTCHA — simple 2-digit addition challenge, stored in Redis ──
const CAPTCHA_TTL = 300; // 5 minutes

function generateCaptcha(): { question: string; answer: number } {
  const a = Math.floor(Math.random() * 90) + 10;
  const b = Math.floor(Math.random() * 90) + 10;
  return { question: `${a} + ${b} = ?`, answer: a + b };
}

app.get('/captcha', async (c: Context) => {
  try {
    const { question, answer } = generateCaptcha();
    const captchaId = randomUUID();
    await redis.set(`captcha:${captchaId}`, String(answer), { EX: CAPTCHA_TTL });
    return c.json({ success: true, data: { captchaId, question } });
  } catch (err) {
    console.error('CAPTCHA error:', err);
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate CAPTCHA' } }, 500);
  }
});

// ── PBKDF2 Salt endpoint ──
app.get('/salt', async (c: Context) => {
  const identifier = (c.req.query('identifier') || '').slice(0, 254);
  if (!identifier) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing identifier' } }, 400);
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.username, identifier),
    }) || await db.query.users.findFirst({
      where: eq(users.email, identifier),
    });
    return c.json({ success: true, data: { salt: user?.pbkdf2Salt || 'co-md-pbkdf2-salt-v1' } });
  } catch (err) {
    console.error('/salt error:', err);
    return c.json({ success: true, data: { salt: 'co-md-pbkdf2-salt-v1' } });
  }
});

// ── Uniqueness check — async validation before register ──
app.get('/check', async (c: Context) => {
  const username = (c.req.query('username') || '').slice(0, 30);
  const email = (c.req.query('email') || '').slice(0, 254);
  const phone = (c.req.query('phone') || '').slice(0, 20);

  try {
    const result: Record<string, boolean> = {};
    if (username) {
      const u = await db.query.users.findFirst({ where: eq(users.username, username) });
      result.usernameTaken = !!u;
    }
    if (email) {
      const e = await db.query.users.findFirst({ where: eq(users.email, email) });
      result.emailTaken = !!e;
    }
    if (phone) {
      const p = await db.query.users.findFirst({ where: eq(users.phone, phone) });
      result.phoneTaken = !!p;
    }
    return c.json({ success: true, data: result });
  } catch (err) {
    console.error('/check error:', err);
    return c.json({ success: false, error: { code: 'CHECK_FAILED', message: 'Failed to check' } }, 500);
  }
});

// ── CAPTCHA validator helper ──
async function verifyCaptcha(c: Context, captchaId: string, captchaAnswer: number): Promise<boolean> {
  const key = `captcha:${captchaId}`;
  const expected = await redis.get(key);
  if (!expected) return false;
  if (parseInt(expected, 10) !== captchaAnswer) return false;
  await redis.del(key); // one-time use
  return true;
}

app.post('/register', async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = registerSchemaLocal.parse(body);

    // CAPTCHA verification
    const captchaOk = await verifyCaptcha(c, validated.captchaId, validated.captchaAnswer);
    if (!captchaOk) {
      return c.json({ success: false, error: { code: 'CAPTCHA_EXPIRED', message: 'CAPTCHA expired or invalid' } }, 400);
    }

    // Check if username, email, or phone already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, validated.username),
    });

    if (existingUser) {
      return c.json(
        {
          success: false,
          error: { code: 'USERNAME_TAKEN', message: 'This username is already taken' },
        },
        400
      );
    }

    const existingEmail = await db.query.users.findFirst({
      where: eq(users.email, validated.email),
    });

    if (existingEmail) {
      return c.json(
        {
          success: false,
          error: { code: 'EMAIL_TAKEN', message: 'This email is already registered' },
        },
        400
      );
    }

    const existingPhone = await db.query.users.findFirst({
      where: eq(users.phone, validated.phone),
    });

    if (existingPhone) {
      return c.json(
        {
          success: false,
          error: { code: 'PHONE_TAKEN', message: 'This phone number is already registered' },
        },
        400
      );
    }

    const passwordHash = await bcrypt.hash(validated.passwordHash, 10);
    const userId = randomUUID();
    const now = new Date();

    await db.insert(users).values({
      id: userId,
      username: validated.username,
      email: validated.email,
      phone: validated.phone,
      pbkdf2Salt: validated.pbkdf2Salt,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    // Create session
    const accessToken = await signAccessToken(userId);
    const refreshToken = await signRefreshToken(userId);
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(sessions).values({
      id: sessionId,
      userId,
      accessToken,
      refreshTokenHash: hashToken(refreshToken),
      createdAt: now,
      expiresAt,
    });

    return c.json({
      success: true,
      data: {
        user: {
          id: userId,
          username: validated.username,
          email: validated.email,
          phone: validated.phone,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          id: sessionId,
          expiresAt,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err },
        },
        400
      );
    }
    throw err;
  }
});

app.post('/login', async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = loginSchemaLocal.parse(body);

    // CAPTCHA verification
    const captchaOk = await verifyCaptcha(c, validated.captchaId, validated.captchaAnswer);
    if (!captchaOk) {
      return c.json({ success: false, error: { code: 'CAPTCHA_EXPIRED', message: 'CAPTCHA expired or invalid' } }, 400);
    }

    // Find user by username, email, or phone
    const user = await db.query.users.findFirst({
      where: eq(users.username, validated.identifier),
    });

    const emailUser = user || (await db.query.users.findFirst({
      where: eq(users.email, validated.identifier),
    }));

    const phoneUser = emailUser || (await db.query.users.findFirst({
      where: eq(users.phone, validated.identifier),
    }));

    if (!phoneUser) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username, email, phone, or password' },
        },
        401
      );
    }

    const validPassword = await bcrypt.compare(validated.passwordHash, phoneUser.passwordHash);

    if (!validPassword) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username, email, phone, or password' },
        },
        401
      );
    }

    // Delete existing sessions (single session mode)
    await db.delete(sessions).where(eq(sessions.userId, phoneUser.id));

    // Create new session
    const accessToken = await signAccessToken(phoneUser.id);
    const refreshToken = await signRefreshToken(phoneUser.id);
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const now = new Date();

    await db.insert(sessions).values({
      id: sessionId,
      userId: phoneUser.id,
      accessToken,
      refreshTokenHash: hashToken(refreshToken),
      createdAt: now,
      expiresAt,
    });

    return c.json({
      success: true,
      data: {
        user: {
          id: phoneUser.id,
          username: phoneUser.username,
          email: phoneUser.email,
          phone: phoneUser.phone,
          createdAt: phoneUser.createdAt,
          updatedAt: phoneUser.updatedAt,
        },
        session: {
          id: sessionId,
          expiresAt,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err },
        },
        400
      );
    }
    throw err;
  }
});

app.post('/refresh', async (c: Context) => {
  try {
    // RT is sent in Authorization header (opaque token, not a JWT body field).
    // The frontend Worker never exposes the RT to the main thread.
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return c.json(
        { success: false, error: { code: 'INVALID_TOKEN', message: 'Missing refresh token' } },
        401
      );
    }

    const payload = await verifyRefreshToken(token);

    // Body may carry fingerprint for binding validation (future).
    // Parse but don't fail on missing/invalid body — the schema is optional.
    try {
      const body = await c.req.json();
      refreshTokenSchemaLocal.parse(body);
    } catch {
      // body is optional — proceed with token-only refresh
    }

    // Find session by refresh token hash
    const tokenHash = hashToken(token);
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.refreshTokenHash, tokenHash),
    });

    if (!session) {
      return c.json(
        { success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } },
        401
      );
    }

    // Delete old session (rotation)
    await db.delete(sessions).where(eq(sessions.id, session.id));

    // Create new tokens
    const newAccessToken = await signAccessToken(payload.sub);
    const newRefreshToken = await signRefreshToken(payload.sub);
    const newSessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const now = new Date();

    await db.insert(sessions).values({
      id: newSessionId,
      userId: payload.sub,
      accessToken: newAccessToken,
      refreshTokenHash: hashToken(newRefreshToken),
      createdAt: now,
      expiresAt,
    });

    return c.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (err) {
    return c.json(
      { success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' } },
      401
    );
  }
});

app.post('/logout', authMiddleware, async (c: Context) => {
  const user = c.get('user');

  // Delete all sessions for this user
  await db.delete(sessions).where(eq(sessions.userId, user.id));

  return c.json({ success: true });
});

app.post('/password-reset/request', async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = passwordResetRequestSchemaLocal.parse(body);

    // CAPTCHA verification
    const captchaOk = await verifyCaptcha(c, validated.captchaId, validated.captchaAnswer);
    if (!captchaOk) {
      return c.json({ success: false, error: { code: 'CAPTCHA_EXPIRED', message: 'CAPTCHA expired or invalid' } }, 400);
    }

    const identifier = validated.identifier;
    // Match by email or username (same behaviour as login)
    const user = (await db.query.users.findFirst({ where: eq(users.email, identifier) }))
      || (await db.query.users.findFirst({ where: eq(users.username, identifier) }));

    if (!user || !user.email) {
      // Don't reveal if email exists or not
      return c.json({
        success: true,
        data: { message: 'If an account exists with this email, a reset link has been sent' },
      });
    }

    // Generate a cryptographically random reset token + store in Redis (15 min TTL)
    const token = randomBytes(32).toString('hex');
    const key = `pwd_reset:${token}`;
    await redis.set(key, user.id, { EX: 900 }); // 15 minutes

    // Send password reset email (fire-and-forget — failure logged but not exposed)
    const lang = validated.lang || 'en';
    emailService.sendPasswordResetEmail(user.email, user.username, token, lang).catch((err) => {
      console.error('[password-reset] Failed to send email:', err instanceof Error ? err.message : String(err));
    });

    return c.json({
      success: true,
      data: { message: 'If an account exists with this email, a reset link has been sent' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input' },
        },
        400
      );
    }
    throw err;
  }
});

// Return the user's PBKDF2 salt for same-password detection on the reset form
app.get('/password-reset/salt', async (c: Context) => {
  const token = (c.req.query('token') || '').slice(0, 128);
  if (!token) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing token' } }, 400);
  try {
    const userId = await redis.get(`pwd_reset:${token}`);
    if (!userId) return c.json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token not found' } }, 400);
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    return c.json({ success: true, data: { salt: user?.pbkdf2Salt || 'co-md-pbkdf2-salt-v1' } });
  } catch {
    return c.json({ success: true, data: { salt: 'co-md-pbkdf2-salt-v1' } });
  }
});

// Check whether the new password matches the current one (async validation on reset form)
app.post('/password-reset/check', async (c: Context) => {
  try {
    const { token, passwordHash } = (await c.req.json()) || {};
    if (!token || !passwordHash) return c.json({ success: false, error: { code: 'BAD_REQUEST' } }, 400);
    const userId = await redis.get(`pwd_reset:${String(token).slice(0, 128)}`);
    if (!userId) return c.json({ success: true, data: { same: false } }); // token invalid, just say no
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) return c.json({ success: true, data: { same: false } });
    const isSame = await bcrypt.compare(String(passwordHash), user.passwordHash);
    return c.json({ success: true, data: { same: isSame } });
  } catch {
    return c.json({ success: true, data: { same: false } });
  }
});

// Verify whether a reset token is still valid (called by PasswordResetPage on mount)
app.get('/password-reset/verify', async (c: Context) => {
  const token = (c.req.query('token') || '').slice(0, 128);
  if (!token) return c.json({ success: true, data: { valid: false } });
  try {
    const key = `pwd_reset:${token}`;
    const exists = await redis.exists(key);
    return c.json({ success: true, data: { valid: exists === 1 } });
  } catch {
    return c.json({ success: true, data: { valid: false } });
  }
});

app.post('/password-reset/confirm', async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = passwordResetConfirmSchemaLocal.parse(body);

    // Verify token exists and get the associated user ID
    const key = `pwd_reset:${validated.token}`;
    const userId = await redis.get(key);
    if (!userId) {
      return c.json(
        { success: false, error: { code: 'INVALID_TOKEN', message: 'Reset token is invalid or has expired' } },
        400
      );
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      return c.json({ success: false, error: { code: 'INVALID_TOKEN', message: 'User not found' } }, 400);
    }

    // Reject if the new password matches the current one (same PBKDF2 salt used on frontend)
    const isSamePassword = await bcrypt.compare(validated.newPasswordHash, user.passwordHash);
    if (isSamePassword) {
      return c.json(
        { success: false, error: { code: 'SAME_PASSWORD', message: 'New password must differ from the current password' } },
        400
      );
    }

    // Hash the new PBKDF2 hash with bcrypt and update the user record
    const storedHash = await bcrypt.hash(validated.newPasswordHash, 10);

    // Invalidate all existing sessions so old tokens can't be used
    const userSessions = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: storedHash, pbkdf2Salt: validated.newPbkdf2Salt, updatedAt: new Date() })
        .where(eq(users.id, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    });
    await delTokensByUserId(userId);
    for (const s of userSessions) {
      await blacklistSession(s.id);
    }

    // Consume the token (prevent replay)
    await redis.del(key);

    return c.json({
      success: true,
      data: { message: 'Password has been reset successfully' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input' },
        },
        400
      );
    }
    throw err;
  }
});

export default app;
