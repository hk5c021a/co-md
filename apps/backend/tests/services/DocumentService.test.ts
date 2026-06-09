import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentService, DocumentError } from '../../src/services/DocumentService.js';

// Mock db — use vi.hoisted so variables are available in the hoisted vi.mock factory
const { mockDbDeleteReturning } = vi.hoisted(() => ({
  mockDbDeleteReturning: vi.fn(),
}));

vi.mock('../../src/db/index.js', () => ({
  db: {
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: mockDbDeleteReturning,
      })),
    })),
  },
  Tx: Object,
}));

// Mock repositories — single mock factory for the whole module
vi.mock('../../src/repositories/index.js', () => ({
  notificationRepository: {
    create: vi.fn(),
  },
  documentRepository: {
    findById: vi.fn(),
    findByOwnerId: vi.fn(),
    countByOwnerId: vi.fn(),
    findByIds: vi.fn(),
    findByOwnerIdAndTitle: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteByOwnerId: vi.fn(),
  },
  permissionRepository: {
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findByDocumentAndUser: vi.fn(),
    findByDocumentId: vi.fn(),
    findDocumentIdsByUserId: vi.fn(),
    findByGrantedBy: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteByDocumentAndUser: vi.fn(),
    deleteByDocumentId: vi.fn(),
    deleteByUserId: vi.fn(),
  },
}));

import { documentRepository, permissionRepository } from '../../src/repositories/index.js';

describe('DocumentService', () => {
  let documentService: DocumentService;

  beforeEach(() => {
    documentService = new DocumentService();
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a document successfully', async () => {
      const createData = {
        title: 'Test Document',
        content: { text: 'Hello' },
        ownerId: 'user-123',
      };

      const mockDocument = {
        id: 'doc-123',
        title: createData.title,
        content: createData.content,
        ownerId: createData.ownerId,
        version: '0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(documentRepository.create).mockResolvedValue(mockDocument);

      const result = await documentService.create(createData);

      expect(result.title).toBe(createData.title);
      expect(result.ownerId).toBe(createData.ownerId);
      expect(documentRepository.create).toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('should return document when found', async () => {
      const mockDocument = {
        id: 'doc-123',
        title: 'Test Document',
        content: null,
        ownerId: 'user-123',
        version: '0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(documentRepository.findById).mockResolvedValue(mockDocument);

      const result = await documentService.getById('doc-123');

      expect(result).toEqual(mockDocument);
    });

    it('should return null when document not found', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue(null);

      const result = await documentService.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAllForUser', () => {
    it('should return all documents for user including shared', async () => {
      const userId = 'user-123';
      const ownedDocs = [
        { id: 'doc-1', title: 'Owned Doc', ownerId: userId },
        { id: 'doc-2', title: 'Another Owned', ownerId: userId },
      ];
      const sharedDocs = [{ id: 'doc-3', title: 'Shared Doc', ownerId: 'other-user' }];

      vi.mocked(documentRepository.countByOwnerId).mockResolvedValue(2);
      vi.mocked(documentRepository.findByOwnerId).mockResolvedValue(ownedDocs as any);
      vi.mocked(permissionRepository.findByUserId).mockResolvedValue([
        { documentId: 'doc-3', level: 'read-write' },
      ] as any);
      vi.mocked(documentRepository.findByIds).mockResolvedValue(sharedDocs as any);

      const result = await documentService.getAllForUser(userId);

      expect(result.items.length).toBe(3);
      expect(result.total).toBe(3);
      expect(result.items.find((d) => d.id === 'doc-1')).toBeDefined();
      expect(result.items.find((d) => d.id === 'doc-3')).toBeDefined();
    });

    it('should deduplicate documents', async () => {
      const userId = 'user-123';
      const ownedDocs = [{ id: 'doc-1', title: 'Owned Doc', ownerId: userId }];

      vi.mocked(documentRepository.countByOwnerId).mockResolvedValue(1);
      vi.mocked(documentRepository.findByOwnerId).mockResolvedValue(ownedDocs as any);
      vi.mocked(permissionRepository.findByUserId).mockResolvedValue([
        { documentId: 'doc-1', level: 'read-write' },
      ] as any);
      vi.mocked(documentRepository.findByIds).mockResolvedValue([ownedDocs[0]] as any);

      const result = await documentService.getAllForUser(userId);

      expect(result.items.length).toBe(1);
    });

    it('should return only owned docs when no shared docs', async () => {
      const userId = 'user-123';
      const ownedDocs = [{ id: 'doc-1', title: 'Owned Doc', ownerId: userId }];

      vi.mocked(documentRepository.countByOwnerId).mockResolvedValue(1);
      vi.mocked(documentRepository.findByOwnerId).mockResolvedValue(ownedDocs as any);
      vi.mocked(permissionRepository.findByUserId).mockResolvedValue([]);

      const result = await documentService.getAllForUser(userId);

      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getAccessibleDocuments', () => {
    it('should return owned and shared docs with matching permission levels', async () => {
      const userId = 'user-123';
      const ownedDocs = [{ id: 'doc-1', title: 'Owned Doc', ownerId: userId }];
      const sharedDocs = [{ id: 'doc-2', title: 'Shared Doc', ownerId: 'other-user' }];

      vi.mocked(documentRepository.findByOwnerId).mockResolvedValue(ownedDocs as any);
      vi.mocked(permissionRepository.findByUserId).mockResolvedValue([
        { documentId: 'doc-2', level: 'read-write' },
        { documentId: 'doc-3', level: 'revoked' },
      ] as any);
      vi.mocked(documentRepository.findByIds).mockResolvedValue(sharedDocs as any);

      const result = await documentService.getAccessibleDocuments(userId, ['read-write']);

      expect(result.length).toBe(2);
      expect(result.find((d) => d.id === 'doc-2')).toBeDefined();
    });

    it('should exclude revoked permissions by default', async () => {
      const userId = 'user-123';
      const ownedDocs = [{ id: 'doc-1', title: 'Owned Doc', ownerId: userId }];

      vi.mocked(documentRepository.findByOwnerId).mockResolvedValue(ownedDocs as any);
      vi.mocked(permissionRepository.findByUserId).mockResolvedValue([
        { documentId: 'doc-2', level: 'revoked' },
      ] as any);

      const result = await documentService.getAccessibleDocuments(userId);

      expect(result.length).toBe(1);
    });

    it('should return only owned docs when no matching permissions', async () => {
      const userId = 'user-123';
      const ownedDocs = [{ id: 'doc-1', title: 'Owned Doc', ownerId: userId }];

      vi.mocked(documentRepository.findByOwnerId).mockResolvedValue(ownedDocs as any);
      vi.mocked(permissionRepository.findByUserId).mockResolvedValue([]);

      const result = await documentService.getAccessibleDocuments(userId, ['read-only']);

      expect(result.length).toBe(1);
    });
  });

  describe('update', () => {
    it('should update document when user has access', async () => {
      const docId = 'doc-123';
      const userId = 'user-123';
      const updateData = { title: 'Updated Title' };

      const mockDocument = {
        id: docId,
        title: 'Original Title',
        content: null,
        ownerId: userId,
        version: '0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedDoc = { ...mockDocument, ...updateData };

      vi.mocked(documentRepository.findById).mockResolvedValue(mockDocument as any);
      vi.mocked(documentRepository.update).mockResolvedValue(updatedDoc as any);

      const result = await documentService.update(docId, userId, updateData);

      expect(result.title).toBe('Updated Title');
    });

    it('should throw error when user has no access', async () => {
      const docId = 'doc-123';
      const userId = 'other-user';

      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: docId,
        ownerId: 'user-123',
      } as any);
      vi.mocked(permissionRepository.findByDocumentAndUser).mockResolvedValue(null);

      await expect(documentService.update(docId, userId, { title: 'New' })).rejects.toThrow(
        DocumentError
      );
      await expect(documentService.update(docId, userId, { title: 'New' })).rejects.toThrow(
        'You do not have permission to edit this document'
      );
    });

    it('should throw error when document not found', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue(null);

      await expect(
        documentService.update('nonexistent', 'user-123', { title: 'New' })
      ).rejects.toThrow(DocumentError);
    });
  });

  describe('delete', () => {
    it('should delete document when user is owner', async () => {
      const docId = 'doc-123';
      const userId = 'user-123';

      mockDbDeleteReturning.mockResolvedValue([{ id: docId }]);

      await expect(documentService.delete(docId, userId)).resolves.not.toThrow();
    });

    it('should throw error when user is not owner', async () => {
      const docId = 'doc-123';
      const userId = 'other-user';

      mockDbDeleteReturning.mockResolvedValue([]);
      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: docId,
        ownerId: 'user-123',
      } as any);

      await expect(documentService.delete(docId, userId)).rejects.toThrow(DocumentError);
      await expect(documentService.delete(docId, userId)).rejects.toThrow(
        'Only the owner can delete a document'
      );
    });
  });

  describe('hasAccess', () => {
    it('should return true for owner', async () => {
      const docId = 'doc-123';
      const userId = 'user-123';

      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: docId,
        ownerId: userId,
      } as any);

      const result = await documentService.hasAccess(docId, userId);

      expect(result).toBe(true);
    });

    it('should return true when user has permission', async () => {
      const docId = 'doc-123';
      const userId = 'user-456';

      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: docId,
        ownerId: 'other-user',
      } as any);
      vi.mocked(permissionRepository.findByDocumentAndUser).mockResolvedValue({
        level: 'read-write',
      } as any);

      const result = await documentService.hasAccess(docId, userId);

      expect(result).toBe(true);
    });

    it('should return false when user has no permission', async () => {
      const docId = 'doc-123';
      const userId = 'user-789';

      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: docId,
        ownerId: 'other-user',
      } as any);
      vi.mocked(permissionRepository.findByDocumentAndUser).mockResolvedValue(null);

      const result = await documentService.hasAccess(docId, userId);

      expect(result).toBe(false);
    });

    it('should return false when document not found', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue(null);

      const result = await documentService.hasAccess('nonexistent', 'user-123');

      expect(result).toBe(false);
    });
  });

  describe('getPermissionLevel', () => {
    it('should return owner for document owner', async () => {
      const docId = 'doc-123';
      const userId = 'user-123';

      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: docId,
        ownerId: userId,
      } as any);

      const result = await documentService.getPermissionLevel(docId, userId);

      expect(result).toBe('owner');
    });

    it('should return permission level when user has permission', async () => {
      const docId = 'doc-123';
      const userId = 'user-456';

      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: docId,
        ownerId: 'other-user',
      } as any);
      vi.mocked(permissionRepository.findByDocumentAndUser).mockResolvedValue({
        level: 'read-only',
      } as any);

      const result = await documentService.getPermissionLevel(docId, userId);

      expect(result).toBe('read-only');
    });

    it('should return null when user has no access', async () => {
      const docId = 'doc-123';
      const userId = 'user-789';

      vi.mocked(documentRepository.findById).mockResolvedValue({
        id: docId,
        ownerId: 'other-user',
      } as any);
      vi.mocked(permissionRepository.findByDocumentAndUser).mockResolvedValue(null);

      const result = await documentService.getPermissionLevel(docId, userId);

      expect(result).toBeNull();
    });

    it('should return null when document not found', async () => {
      vi.mocked(documentRepository.findById).mockResolvedValue(null);

      const result = await documentService.getPermissionLevel('nonexistent', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('checkNameDuplicate', () => {
    it('should return true when name is duplicate', async () => {
      vi.mocked(documentRepository.findByOwnerIdAndTitle).mockResolvedValue({
        id: 'doc-existing',
        title: 'Existing Title',
      } as any);

      const result = await documentService.checkNameDuplicate('user-123', 'Existing Title');

      expect(result).toBe(true);
    });

    it('should return false when name is not duplicate', async () => {
      vi.mocked(documentRepository.findByOwnerIdAndTitle).mockResolvedValue(null);

      const result = await documentService.checkNameDuplicate('user-123', 'Unique Title');

      expect(result).toBe(false);
    });

    it('should exclude current document id from duplicate check', async () => {
      vi.mocked(documentRepository.findByOwnerIdAndTitle).mockResolvedValue(null);

      const result = await documentService.checkNameDuplicate(
        'user-123',
        'My Title',
        'doc-current'
      );

      expect(documentRepository.findByOwnerIdAndTitle).toHaveBeenCalledWith(
        'user-123',
        'My Title',
        'doc-current'
      );
      expect(result).toBe(false);
    });
  });
});
