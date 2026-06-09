import { redis } from '../db/redis.js';
import { logger } from '../lib/logger.js';
import { NOTIFICATION_CHANNEL_PREFIX, NOTIFICATION_CHANNEL_SUFFIX } from '@collab/shared';

/**
 * Publish a real-time notification to a user's Redis pub/sub channel.
 * Fire-and-forget — errors are logged but do not throw.
 */
export async function publishUserNotification(userId: string, message: Record<string, unknown>): Promise<void> {
  try {
    await redis.publish(
      `${NOTIFICATION_CHANNEL_PREFIX}${userId}${NOTIFICATION_CHANNEL_SUFFIX}`,
      JSON.stringify({ ...message, timestamp: new Date().toISOString() })
    );
  } catch (err) {
    logger.error('Notification publish failed:', { userId, error: err });
  }
}
