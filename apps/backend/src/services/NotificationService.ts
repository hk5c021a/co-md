import { notificationRepository } from '../repositories/index.js';
import type { Notification } from '../db/schema.js';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

export class NotificationService {
  async getUserNotifications(userId: string, limit = 50, offset = 0): Promise<PaginatedResult<Notification>> {
    const [items, total] = await Promise.all([
      notificationRepository.findByUserId(userId, limit, offset),
      notificationRepository.countByUserId(userId),
    ]);
    return { items, total };
  }

  async getUnreadNotifications(userId: string, limit = 50, offset = 0): Promise<PaginatedResult<Notification>> {
    const [items, total] = await Promise.all([
      notificationRepository.findUnreadByUserId(userId, limit, offset),
      notificationRepository.countUnreadByUserId(userId),
    ]);
    return { items, total };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return notificationRepository.countUnreadByUserId(userId);
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await notificationRepository.findById(id);
    if (!notification) {
      throw new NotificationError('NOT_FOUND', 'Notification not found');
    }

    if (notification.userId !== userId) {
      throw new NotificationError('ACCESS_DENIED', 'This notification is not for you');
    }

    const updated = await notificationRepository.markAsRead(id);
    if (!updated) {
      throw new NotificationError('UPDATE_FAILED', 'Failed to mark notification as read');
    }

    return updated;
  }

  async markAllAsRead(userId: string): Promise<number> {
    return notificationRepository.markAllAsRead(userId);
  }

  async deleteNotification(id: string, userId: string): Promise<void> {
    const notification = await notificationRepository.findById(id);
    if (!notification) {
      throw new NotificationError('NOT_FOUND', 'Notification not found');
    }

    if (notification.userId !== userId) {
      throw new NotificationError('ACCESS_DENIED', 'This notification is not for you');
    }

    await notificationRepository.delete(id);
  }

  async deleteAllForUser(userId: string): Promise<number> {
    return notificationRepository.deleteByUserId(userId);
  }
}

export class NotificationError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'NotificationError';
  }
}

export const notificationService = new NotificationService();
