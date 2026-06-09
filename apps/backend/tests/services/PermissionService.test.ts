import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionService, PermissionError } from '../../src/services/PermissionService.js';

// Mock db.transaction — executes callback with a mock tx object
vi.mock('../../src/db/index.js', () => ({
  db: {
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
  },
  Tx: Object,
}));

// Mock repositories
vi.mock('../../src/repositories/index.js', () => ({
  permissionRepository: {
    findById: vi.fn(),
    findByDocumentId: vi.fn(),
    findByUserId: vi.fn(),
    findByDocumentAndUser: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteByDocumentAndUser: vi.fn(),
  },
  documentRepository: {
    findById: vi.fn(),
  },
  userRepository: {
    findById: vi.fn(),
    findByIds: vi.fn().mockResolvedValue([]),
  },
  notificationRepository: {
    create: vi.fn(),
  },
}));

import {
  permissionRepository,
  documentRepository,
  userRepository,
  notificationRepository,
} from '../../src/repositories/index.js';

describe('PermissionService', () => {
  let permissionService: PermissionService;

  beforeEach(() => {
    permissionService = new PermissionService();
    vi.clearAllMocks();
  });

  describe('grant', () => {
    it('should grant permission successfully', async () => {
      const grantData = {
        documentId: 'doc-123',
        userId: 'user-456',
        level: 'read-write' as const,
        grantedBy: 'user-123',
      };

      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'user-123',
        title: 'Test Doc',
      } as any);
      vi.mocked(userRepository.findById).mockResolvedValue({
        id: 'user-456',
        username: 'Test User',
      } as any);
      vi.mocked(permissionRepository.upsert).mockResolvedValue({
        id: 'perm-123',
        documentId: grantData.documentId,
        userId: grantData.userId,
        level: grantData.level,
        grantedBy: grantData.grantedBy,
      } as any);
      vi.mocked(notificationRepository.create).mockResolvedValue({} as any);

      const result = await permissionService.grant(grantData);

      expect(result.documentId).toBe(grantData.documentId);
      expect(result.level).toBe(grantData.level);
    });

    it('should throw error when document not found', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue(null);

      await expect(
        permissionService.grant({
          documentId: 'nonexistent',
          userId: 'user-456',
          level: 'read-write',
          grantedBy: 'user-123',
        })
      ).rejects.toThrow(PermissionError);
      await expect(
        permissionService.grant({
          documentId: 'nonexistent',
          userId: 'user-456',
          level: 'read-write',
          grantedBy: 'user-123',
        })
      ).rejects.toThrow('Document not found');
    });

    it('should throw error when user not found', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'user-123',
      } as any);
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      await expect(
        permissionService.grant({
          documentId: 'doc-123',
          userId: 'nonexistent',
          level: 'read-write',
          grantedBy: 'user-123',
        })
      ).rejects.toThrow(PermissionError);
      await expect(
        permissionService.grant({
          documentId: 'doc-123',
          userId: 'nonexistent',
          level: 'read-write',
          grantedBy: 'user-123',
        })
      ).rejects.toThrow('User not found');
    });

    it('should throw error when non-owner tries to grant', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'user-123',
      } as any);
      vi.mocked(userRepository.findById).mockResolvedValue({
        id: 'user-456',
      } as any);

      await expect(
        permissionService.grant({
          documentId: 'doc-123',
          userId: 'user-456',
          level: 'read-write',
          grantedBy: 'other-user',
        })
      ).rejects.toThrow(PermissionError);
      await expect(
        permissionService.grant({
          documentId: 'doc-123',
          userId: 'user-456',
          level: 'read-write',
          grantedBy: 'other-user',
        })
      ).rejects.toThrow('Only the document owner can grant permissions');
    });

    it('should throw error when granting permission to owner', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'user-123',
      } as any);
      vi.mocked(userRepository.findById).mockResolvedValue({
        id: 'user-123',
      } as any);

      await expect(
        permissionService.grant({
          documentId: 'doc-123',
          userId: 'user-123',
          level: 'read-write',
          grantedBy: 'user-123',
        })
      ).rejects.toThrow(PermissionError);
      await expect(
        permissionService.grant({
          documentId: 'doc-123',
          userId: 'user-123',
          level: 'read-write',
          grantedBy: 'user-123',
        })
      ).rejects.toThrow('Cannot change permissions for document owner');
    });
  });

  describe('revoke', () => {
    it('should revoke permission successfully', async () => {
      vi.mocked(permissionRepository.findById).mockResolvedValue({
        id: 'perm-123',
        documentId: 'doc-123',
        userId: 'user-456',
        level: 'read-write',
      } as any);
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'user-123',
        title: 'Test Doc',
      } as any);
      vi.mocked(permissionRepository.delete).mockResolvedValue(true);
      vi.mocked(notificationRepository.create).mockResolvedValue({} as any);

      await expect(permissionService.revoke('perm-123', 'user-123')).resolves.not.toThrow();
      expect(permissionRepository.delete).toHaveBeenCalledWith('perm-123');
    });

    it('should throw error when permission not found', async () => {
      vi.mocked(permissionRepository.findById).mockResolvedValue(null);

      await expect(permissionService.revoke('nonexistent', 'user-123')).rejects.toThrow(
        PermissionError
      );
    });

    it('should throw error when non-owner tries to revoke', async () => {
      vi.mocked(permissionRepository.findById).mockResolvedValue({
        id: 'perm-123',
        documentId: 'doc-123',
        userId: 'user-456',
      } as any);
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'user-123',
      } as any);

      await expect(permissionService.revoke('perm-123', 'other-user')).rejects.toThrow(
        PermissionError
      );
      await expect(permissionService.revoke('perm-123', 'other-user')).rejects.toThrow(
        'Only the document owner can revoke permissions'
      );
    });
  });

  describe('batchGrant', () => {
    it('should batch grant multiple permissions successfully', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'user-123',
        title: 'Test Doc',
      } as any);
      vi.mocked(userRepository.findByIds).mockResolvedValue([
        { id: 'user-456', username: 'Test User' },
        { id: 'user-789', username: 'Other User' },
      ] as any);
      vi.mocked(permissionRepository.findByDocumentId).mockResolvedValue([]);
      vi.mocked(permissionRepository.upsert).mockResolvedValue({
        id: 'perm-1',
        documentId: 'doc-123',
        userId: 'user-456',
        level: 'read-write',
        grantedBy: 'user-123',
      } as any);
      vi.mocked(notificationRepository.create).mockResolvedValue({} as any);

      const result = await permissionService.batchGrant({
        documentId: 'doc-123',
        permissions: [
          { userId: 'user-456', level: 'read-write' as const },
          { userId: 'user-789', level: 'read-only' as const },
        ],
        grantedBy: 'user-123',
      });

      expect(result).toHaveLength(2);
      expect(permissionRepository.upsert).toHaveBeenCalledTimes(2);
      expect(notificationRepository.create).toHaveBeenCalledTimes(2);
    });

    it('should throw error when non-owner tries to batch grant', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'user-123',
      } as any);

      await expect(
        permissionService.batchGrant({
          documentId: 'doc-123',
          permissions: [{ userId: 'user-456', level: 'read-write' }],
          grantedBy: 'other-user',
        })
      ).rejects.toThrow('Only the document owner can grant permissions');
    });
  });

  describe('leaveDocument', () => {
    it('should leave document successfully', async () => {
      vi.mocked(permissionRepository.deleteByDocumentAndUser).mockResolvedValue(true);

      await expect(permissionService.leaveDocument('doc-123', 'user-456')).resolves.not.toThrow();

      expect(permissionRepository.deleteByDocumentAndUser).toHaveBeenCalledWith(
        'doc-123',
        'user-456'
      );
    });

    it('should throw error when user is not a collaborator', async () => {
      vi.mocked(permissionRepository.deleteByDocumentAndUser).mockResolvedValue(false);

      await expect(permissionService.leaveDocument('doc-123', 'user-789')).rejects.toThrow(
        PermissionError
      );
      await expect(permissionService.leaveDocument('doc-123', 'user-789')).rejects.toThrow(
        'Permission not found'
      );
    });
  });

  describe('getMyPermissions', () => {
    it('should return permissions for user', async () => {
      vi.mocked(permissionRepository.findByUserId).mockResolvedValue([
        {
          id: 'perm-1',
          documentId: 'doc-1',
          userId: 'user-123',
          level: 'read-write',
          grantedBy: 'owner-1',
        },
        {
          id: 'perm-2',
          documentId: 'doc-2',
          userId: 'user-123',
          level: 'read-only',
          grantedBy: 'owner-2',
        },
      ] as any);

      const result = await permissionService.getMyPermissions('user-123');

      expect(result).toHaveLength(2);
      expect(result[0].documentId).toBe('doc-1');
      expect(result[1].documentId).toBe('doc-2');
    });

    it('should return empty array when no permissions', async () => {
      vi.mocked(permissionRepository.findByUserId).mockResolvedValue([]);

      const result = await permissionService.getMyPermissions('user-123');

      expect(result).toHaveLength(0);
    });
  });

  describe('getDocumentPermissions', () => {
    it('should return permissions when user is owner', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'user-123',
      } as any);
      vi.mocked(permissionRepository.findByDocumentId).mockResolvedValue([
        { id: 'perm-1', documentId: 'doc-123', userId: 'user-456', level: 'read-write' },
      ] as any);

      const result = await permissionService.getDocumentPermissions('doc-123', 'user-123');

      expect(result.length).toBe(1);
    });

    it('should throw error when user is not owner', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'user-123',
      } as any);

      await expect(
        permissionService.getDocumentPermissions('doc-123', 'other-user')
      ).rejects.toThrow(PermissionError);
    });
  });

  describe('checkAccess', () => {
    it('should return true for document owner', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'user-123',
      } as any);

      const result = await permissionService.checkAccess('doc-123', 'user-123', ['read-write']);

      expect(result).toBe(true);
    });

    it('should return true when user has required permission level', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'other-user',
      } as any);
      vi.mocked(permissionRepository.findByDocumentAndUser).mockResolvedValue({
        level: 'read-write',
      } as any);

      const result = await permissionService.checkAccess('doc-123', 'user-456', ['read-write']);

      expect(result).toBe(true);
    });

    it('should return false when user lacks required permission level', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'other-user',
      } as any);
      vi.mocked(permissionRepository.findByDocumentAndUser).mockResolvedValue({
        level: 'read-only',
      } as any);

      const result = await permissionService.checkAccess('doc-123', 'user-456', ['read-write']);

      expect(result).toBe(false);
    });

    it('should return false when document not found', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue(null);

      const result = await permissionService.checkAccess('nonexistent', 'user-123', ['read-write']);

      expect(result).toBe(false);
    });
  });

  describe('getPermissionLevel', () => {
    it('should return owner for document owner', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'user-123',
      } as any);

      const result = await permissionService.getPermissionLevel('doc-123', 'user-123');

      expect(result).toBe('owner');
    });

    it('should return permission level for non-owner', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'other-user',
      } as any);
      vi.mocked(permissionRepository.findByDocumentAndUser).mockResolvedValue({
        level: 'read-write',
      } as any);

      const result = await permissionService.getPermissionLevel('doc-123', 'user-456');

      expect(result).toBe('read-write');
    });

    it('should return null when user has no access', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: 'doc-123',
        ownerId: 'other-user',
      } as any);
      vi.mocked(permissionRepository.findByDocumentAndUser).mockResolvedValue(null);

      const result = await permissionService.getPermissionLevel('doc-123', 'user-789');

      expect(result).toBeNull();
    });
  });
});
