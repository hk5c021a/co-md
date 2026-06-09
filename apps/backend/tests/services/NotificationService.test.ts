import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService, NotificationError } from '../../src/services/NotificationService.js';

// Hoist mocks
const {
  mockFindByUserId,
  mockFindUnreadByUserId,
  mockCountByUserId,
  mockCountUnreadByUserId,
  mockFindById,
  mockMarkAsRead,
  mockMarkAllAsRead,
  mockDelete,
  mockDeleteByUserId,
} = vi.hoisted(() => ({
  mockFindByUserId: vi.fn(),
  mockFindUnreadByUserId: vi.fn(),
  mockCountByUserId: vi.fn(),
  mockCountUnreadByUserId: vi.fn(),
  mockFindById: vi.fn(),
  mockMarkAsRead: vi.fn(),
  mockMarkAllAsRead: vi.fn(),
  mockDelete: vi.fn(),
  mockDeleteByUserId: vi.fn(),
}));

vi.mock('../../src/repositories/index.js', () => ({
  notificationRepository: {
    findByUserId: mockFindByUserId,
    findUnreadByUserId: mockFindUnreadByUserId,
    countByUserId: mockCountByUserId,
    countUnreadByUserId: mockCountUnreadByUserId,
    findById: mockFindById,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    delete: mockDelete,
    deleteByUserId: mockDeleteByUserId,
  },
}));

const mockNotification = {
  id: 'notif-1',
  userId: 'user-123',
  type: 'permission-granted' as const,
  content: 'You have been granted access',
  metadata: { documentId: 'doc-1' },
  read: false,
  createdAt: new Date('2025-06-01'),
};

describe('NotificationService', () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    notificationService = new NotificationService();
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════
  // getUserNotifications
  // ═══════════════════════════════════════════════

  describe('getUserNotifications', () => {
    it('should return notifications for user', async () => {
      mockFindByUserId.mockResolvedValue([mockNotification]);
      mockCountByUserId.mockResolvedValue(1);

      const result = await notificationService.getUserNotifications('user-123');

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe('notif-1');
      expect(mockFindByUserId).toHaveBeenCalledWith('user-123', 50, 0);
      expect(mockCountByUserId).toHaveBeenCalledWith('user-123');
    });

    it('should return empty array when no notifications', async () => {
      mockFindByUserId.mockResolvedValue([]);
      mockCountByUserId.mockResolvedValue(0);

      const result = await notificationService.getUserNotifications('user-123');

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════
  // getUnreadNotifications
  // ═══════════════════════════════════════════════

  describe('getUnreadNotifications', () => {
    it('should return unread notifications', async () => {
      mockFindUnreadByUserId.mockResolvedValue([mockNotification]);
      mockCountUnreadByUserId.mockResolvedValue(1);

      const result = await notificationService.getUnreadNotifications('user-123');

      expect(result.items).toHaveLength(1);
      expect(mockFindUnreadByUserId).toHaveBeenCalledWith('user-123', 50, 0);
      expect(mockCountUnreadByUserId).toHaveBeenCalledWith('user-123');
    });

    it('should return empty when all read', async () => {
      mockFindUnreadByUserId.mockResolvedValue([]);
      mockCountUnreadByUserId.mockResolvedValue(0);

      const result = await notificationService.getUnreadNotifications('user-123');

      expect(result.items).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════
  // getUnreadCount
  // ═══════════════════════════════════════════════

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mockCountUnreadByUserId.mockResolvedValue(5);

      const result = await notificationService.getUnreadCount('user-123');

      expect(result).toBe(5);
    });

    it('should return 0 when no unread', async () => {
      mockCountUnreadByUserId.mockResolvedValue(0);

      const result = await notificationService.getUnreadCount('user-123');

      expect(result).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════
  // markAsRead
  // ═══════════════════════════════════════════════

  describe('markAsRead', () => {
    it('should mark notification as read successfully', async () => {
      mockFindById.mockResolvedValue(mockNotification);
      mockMarkAsRead.mockResolvedValue({ ...mockNotification, read: true });

      const result = await notificationService.markAsRead('notif-1', 'user-123');

      expect(result.read).toBe(true);
      expect(mockMarkAsRead).toHaveBeenCalledWith('notif-1');
    });

    it('should throw error when notification not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(notificationService.markAsRead('nonexistent', 'user-123')).rejects.toThrow(
        NotificationError
      );
      await expect(notificationService.markAsRead('nonexistent', 'user-123')).rejects.toThrow(
        'Notification not found'
      );
    });

    it('should throw error when notification belongs to different user', async () => {
      mockFindById.mockResolvedValue({ ...mockNotification, userId: 'other-user' });

      await expect(notificationService.markAsRead('notif-1', 'user-123')).rejects.toThrow(
        'This notification is not for you'
      );
    });

    it('should throw error when markAsRead returns null', async () => {
      mockFindById.mockResolvedValue(mockNotification);
      mockMarkAsRead.mockResolvedValue(null);

      await expect(notificationService.markAsRead('notif-1', 'user-123')).rejects.toThrow(
        'Failed to mark notification as read'
      );
    });
  });

  // ═══════════════════════════════════════════════
  // markAllAsRead
  // ═══════════════════════════════════════════════

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      mockMarkAllAsRead.mockResolvedValue(3);

      const result = await notificationService.markAllAsRead('user-123');

      expect(result).toBe(3);
      expect(mockMarkAllAsRead).toHaveBeenCalledWith('user-123');
    });

    it('should return 0 when no notifications to mark', async () => {
      mockMarkAllAsRead.mockResolvedValue(0);

      const result = await notificationService.markAllAsRead('user-123');

      expect(result).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════
  // deleteNotification
  // ═══════════════════════════════════════════════

  describe('deleteNotification', () => {
    it('should delete notification successfully', async () => {
      mockFindById.mockResolvedValue(mockNotification);
      mockDelete.mockResolvedValue(true);

      await expect(
        notificationService.deleteNotification('notif-1', 'user-123')
      ).resolves.not.toThrow();
      expect(mockDelete).toHaveBeenCalledWith('notif-1');
    });

    it('should throw error when notification not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(
        notificationService.deleteNotification('nonexistent', 'user-123')
      ).rejects.toThrow('Notification not found');
    });

    it('should throw error when notification belongs to different user', async () => {
      mockFindById.mockResolvedValue({ ...mockNotification, userId: 'other-user' });

      await expect(notificationService.deleteNotification('notif-1', 'user-123')).rejects.toThrow(
        'This notification is not for you'
      );
    });
  });

  // ═══════════════════════════════════════════════
  // deleteAllForUser
  // ═══════════════════════════════════════════════

  describe('deleteAllForUser', () => {
    it('should delete all notifications for user', async () => {
      mockDeleteByUserId.mockResolvedValue(5);

      const result = await notificationService.deleteAllForUser('user-123');

      expect(result).toBe(5);
      expect(mockDeleteByUserId).toHaveBeenCalledWith('user-123');
    });

    it('should return 0 when no notifications', async () => {
      mockDeleteByUserId.mockResolvedValue(0);

      const result = await notificationService.deleteAllForUser('user-123');

      expect(result).toBe(0);
    });
  });
});
