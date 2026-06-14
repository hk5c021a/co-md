import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { contactService, ContactError } from '../services/index.js';
import { pageSchema } from '@co-md/shared';
import { logger } from '../lib/logger.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';

const searchUsersSchema = z.object({
  q: z.string().min(1).max(100),
});

const sendInvitationSchema = z.object({
  inviteeId: z.string().uuid(),
});

const app = new Hono();

// Apply auth middleware to all routes
app.use('/*', authMiddleware);

// Search users (separate rate limit to prevent enumeration)
const searchLimit = rateLimitMiddleware({ maxRequests: 10, windowSeconds: 60 });
app.get('/search', searchLimit, async (c: Context) => {
  try {
    const user = c.get('user');
    const query = c.req.query('q');
    const validated = searchUsersSchema.safeParse({ q: query });
    if (!validated.success) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Search query must be 1-100 characters' },
        },
        400
      );
    }

    const results = await contactService.searchUsers(validated.data.q, user.id);

    return c.json({
      success: true,
      data: results,
    });
  } catch (err) {
    logger.error('Error searching users:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to search users' },
      },
      500
    );
  }
});

// Get contact list
app.get('/', async (c: Context) => {
  try {
    const user = c.get('user');
    const { limit, offset } = pageSchema.parse(c.req.query());
    const result = await contactService.getContacts(user.id, limit, offset);

    return c.json({
      success: true,
      data: { items: result.items, total: result.total, limit, offset },
    });
  } catch (err) {
    logger.error('Error fetching contacts:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch contacts' },
      },
      500
    );
  }
});

// Remove contact
app.delete('/:id', async (c: Context) => {
  try {
    const user = c.get('user');
    const contactId = c.req.param('id') as string;

    await contactService.removeContact(user.id, contactId);

    return c.json({
      success: true,
      data: { message: 'Contact removed' },
    });
  } catch (err) {
    if (err instanceof ContactError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'NOT_CONTACT' || err.code === 'USER_NOT_FOUND' ? 404 : 400
      );
    }
    logger.error('Error removing contact:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to remove contact' },
      },
      500
    );
  }
});

// Get pending invitations (sent to current user)
app.get('/invitations', async (c: Context) => {
  try {
    const user = c.get('user');
    const invitations = await contactService.getPendingInvitations(user.id);

    return c.json({
      success: true,
      data: invitations,
    });
  } catch (err) {
    logger.error('Error fetching invitations:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch invitations' },
      },
      500
    );
  }
});

// Send invitation
app.post('/invitations', async (c: Context) => {
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
    const validated = sendInvitationSchema.parse(body);

    const invitation = await contactService.sendInvitation(user.id, validated.inviteeId);

    return c.json(
      {
        success: true,
        data: {
          id: invitation.id,
          expiresAt: invitation.expiresAt,
        },
      },
      201
    );
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
    if (err instanceof ContactError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'INVALID_TARGET' ||
          err.code === 'ALREADY_CONTACTS' ||
          err.code === 'INVITATION_EXISTS'
          ? 400
          : 404
      );
    }
    logger.error('Error sending invitation:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to send invitation' },
      },
      500
    );
  }
});

// Accept invitation
app.post('/invitations/:id/accept', async (c: Context) => {
  try {
    const user = c.get('user');
    const invitationId = c.req.param('id') as string;

    await contactService.acceptInvitation(invitationId, user.id);

    return c.json({
      success: true,
      data: { message: 'Invitation accepted' },
    });
  } catch (err) {
    if (err instanceof ContactError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'NOT_FOUND' ||
          err.code === 'USER_NOT_FOUND' ||
          err.code === 'DOCUMENT_NOT_FOUND'
          ? 404
          : err.code === 'ACCESS_DENIED'
            ? 403
            : 400
      );
    }
    logger.error('Error accepting invitation:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to accept invitation' },
      },
      500
    );
  }
});

// Decline invitation
app.post('/invitations/:id/decline', async (c: Context) => {
  try {
    const user = c.get('user');
    const invitationId = c.req.param('id') as string;

    await contactService.declineInvitation(invitationId, user.id);

    return c.json({
      success: true,
      data: { message: 'Invitation declined' },
    });
  } catch (err) {
    if (err instanceof ContactError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'NOT_FOUND' ||
          err.code === 'USER_NOT_FOUND' ||
          err.code === 'DOCUMENT_NOT_FOUND'
          ? 404
          : err.code === 'ACCESS_DENIED'
            ? 403
            : 400
      );
    }
    logger.error('Error declining invitation:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to decline invitation' },
      },
      500
    );
  }
});

// Get outgoing invitations
app.get('/invitations/outgoing', async (c: Context) => {
  try {
    const user = c.get('user');
    const invitations = await contactService.getOutgoingInvitations(user.id);

    return c.json({
      success: true,
      data: invitations,
    });
  } catch (err) {
    logger.error('Error fetching outgoing invitations:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch invitations' },
      },
      500
    );
  }
});

export default app;
