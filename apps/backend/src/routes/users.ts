import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { userService, UserError } from '../services/index.js';
import { logger } from '../lib/logger.js';

const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  email: z.string().email().optional(),
  phone: z.string().min(10).max(20).optional(),
});

const changePasswordSchema = z.object({
  oldPasswordHash: z.string().min(32),
  newPasswordHash: z.string().min(32),
  newPbkdf2Salt: z.string().min(16),
});

const app = new Hono();

// Apply auth middleware to all routes
app.use('/*', authMiddleware);

// Get current user profile (must be before /:id)
app.get('/me', async (c: Context) => {
  try {
    const user = c.get('user');
    const userProfile = await userService.getProfile(user.id);

    if (!userProfile) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        id: userProfile.id,
        username: userProfile.username,
        email: userProfile.email,
        phone: userProfile.phone,
        createdAt: userProfile.createdAt,
        updatedAt: userProfile.updatedAt,
      },
    });
  } catch (err) {
    logger.error('Error fetching user profile:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch profile' },
      },
      500
    );
  }
});

// Get user by ID (public profile)
app.get('/:id', async (c: Context) => {
  try {
    const userId = c.req.param('id') as string;
    const userProfile = await userService.getProfile(userId);

    if (!userProfile) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        id: userProfile.id,
        username: userProfile.username,
      },
    });
  } catch (err) {
    logger.error('Error fetching user:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch user' },
      },
      500
    );
  }
});

// Update current user profile
app.patch('/me', async (c: Context) => {
  try {
    const user = c.get('user');
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { success: false, error: { code: 'INVALID_JSON', message: 'Invalid request body' } },
        400
      );
    }
    const validated = updateProfileSchema.parse(body);

    const updatedUser = await userService.updateProfile(user.id, {
      username: validated.username,
      email: validated.email,
      phone: validated.phone,
    });

    return c.json({
      success: true,
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        phone: updatedUser.phone,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              process.env.NODE_ENV === 'production' ? 'Invalid input' : (err as Error).message,
          },
        },
        400
      );
    }
    if (err instanceof UserError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'NOT_FOUND' ? 404 : 400
      );
    }
    logger.error('Error updating profile:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update profile' },
      },
      500
    );
  }
});

// Verify current password (lightweight — no mutation, used by settings form async validation)
const verifyPasswordSchema = z.object({ passwordHash: z.string().min(32) });

app.post('/me/verify-password', async (c: Context) => {
  try {
    const user = c.get('user');
    let body;
    try { body = await c.req.json(); } catch {
      return c.json({ success: false, error: { code: 'INVALID_JSON', message: 'Invalid request body' } }, 400);
    }
    const validated = verifyPasswordSchema.parse(body);
    const isValid = await userService.verifyPassword(user.id, validated.passwordHash);
    return c.json({ success: true, data: { valid: isValid } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } }, 400);
    }
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to verify password' } }, 500);
  }
});

// Change password
app.patch('/me/password', async (c: Context) => {
  try {
    const user = c.get('user');
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { success: false, error: { code: 'INVALID_JSON', message: 'Invalid request body' } },
        400
      );
    }
    const validated = changePasswordSchema.parse(body);

    await userService.changePassword(user.id, {
      oldPasswordHash: validated.oldPasswordHash,
      newPasswordHash: validated.newPasswordHash,
      newPbkdf2Salt: validated.newPbkdf2Salt,
    });

    return c.json({
      success: true,
      data: { message: 'Password changed successfully' },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              process.env.NODE_ENV === 'production' ? 'Invalid input' : (err as Error).message,
          },
        },
        400
      );
    }
    if (err instanceof UserError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'NOT_FOUND' ? 404 : 400
      );
    }
    logger.error('Error changing password:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to change password' },
      },
      500
    );
  }
});

// Delete current user account (cascade-deletes all related data via FK onDelete)
app.delete('/me', async (c: Context) => {
  try {
    const user = c.get('user');
    await userService.deleteAccount(user.id);
    return c.json({ success: true, data: { message: 'Account deleted successfully' } }, 200);
  } catch (err) {
    if (err instanceof UserError) {
      return c.json(
        { success: false, error: { code: err.code, message: err.message } },
        err.code === 'NOT_FOUND' ? 404 : 400
      );
    }
    return c.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete account' } },
      500
    );
  }
});

export default app;
