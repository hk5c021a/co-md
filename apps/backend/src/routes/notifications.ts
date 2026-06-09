import { Hono } from 'hono';
import type { Context } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { notificationService, NotificationError } from '../services/index.js';
import { logger } from '../lib/logger.js';
import { pageSchema } from '@collab/shared';

const app = new Hono();

// Apply auth middleware to all routes
app.use('/*', authMiddleware);

// Get all notifications for the current user
app.get('/', async (c: Context) => {
  try {
    const user = c.get('user');
    const query = c.req.query();
    const { limit, offset } = pageSchema.parse(query);

    const result = query.unread === 'true'
      ? await notificationService.getUnreadNotifications(user.id, limit, offset)
      : await notificationService.getUserNotifications(user.id, limit, offset);

    return c.json({
      success: true,
      data: { items: result.items, total: result.total, limit, offset },
    });
  } catch (err) {
    logger.error('Error fetching notifications:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch notifications' },
      },
      500
    );
  }
});

// Get unread count
app.get('/unread-count', async (c: Context) => {
  try {
    const user = c.get('user');
    const count = await notificationService.getUnreadCount(user.id);

    return c.json({
      success: true,
      data: { count },
    });
  } catch (err) {
    logger.error('Error fetching unread count:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch unread count' },
      },
      500
    );
  }
});

// Mark notification as read
app.patch('/:id/read', async (c: Context) => {
  try {
    const user = c.get('user');
    const notificationId = c.req.param('id') as string;

    await notificationService.markAsRead(notificationId, user.id);

    return c.json({
      success: true,
      data: { message: 'Notification marked as read' },
    });
  } catch (err) {
    if (err instanceof NotificationError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'NOT_FOUND' ? 404 : err.code === 'ACCESS_DENIED' ? 403 : 400
      );
    }
    logger.error('Error marking notification as read:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to mark notification as read' },
      },
      500
    );
  }
});

// Mark all notifications as read
app.patch('/read-all', async (c: Context) => {
  try {
    const user = c.get('user');
    const count = await notificationService.markAllAsRead(user.id);

    return c.json({
      success: true,
      data: { message: 'All notifications marked as read', count },
    });
  } catch (err) {
    logger.error('Error marking all notifications as read:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to mark notifications as read' },
      },
      500
    );
  }
});

// Delete notification
app.delete('/:id', async (c: Context) => {
  try {
    const user = c.get('user');
    const notificationId = c.req.param('id') as string;

    await notificationService.deleteNotification(notificationId, user.id);

    return c.json({
      success: true,
      data: { message: 'Notification deleted' },
    });
  } catch (err) {
    if (err instanceof NotificationError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.code === 'NOT_FOUND' ? 404 : err.code === 'ACCESS_DENIED' ? 403 : 400
      );
    }
    logger.error('Error deleting notification:', err);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to delete notification' },
      },
      500
    );
  }
});

export default app;
