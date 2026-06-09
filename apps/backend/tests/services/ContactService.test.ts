import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactService, ContactError } from '../../src/services/ContactService.js';

// Mock db.transaction — executes callback with a mock tx object
vi.mock('../../src/db/index.js', () => ({
  db: {
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
  },
  Tx: Object,
}));

// Mock repositories
vi.mock('../../src/repositories/index.js', () => ({
  userRepository: {
    findByUsername: vi.fn(),
    findByEmail: vi.fn(),
    findByPhone: vi.fn(),
    findById: vi.fn(),
    findByIds: vi.fn(),
    searchByFuzzy: vi.fn(),
  },
  contactRepository: {
    findByUserId: vi.fn(),
    countByUserId: vi.fn(),
    areContacts: vi.fn(),
    createBidirectional: vi.fn(),
    deleteBidirectional: vi.fn(),
  },
  invitationRepository: {
    existsPendingBetweenUsers: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByInviteeId: vi.fn(),
    findByInviterId: vi.fn(),
    updateStatus: vi.fn(),
  },
  notificationRepository: {
    create: vi.fn(),
    findByIds: vi.fn().mockResolvedValue([]),
  },
  documentRepository: {
    findByOwnerId: vi.fn(),
  },
  permissionRepository: {
    findByDocumentAndUser: vi.fn(),
    findByUserId: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
  },
}));

// Mock CacheService (used by ContactService for permissionCache)
vi.mock('../../src/services/CacheService.js', () => ({
  permissionCache: {
    delete: vi.fn(),
  },
  userCache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
  documentCache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
  contactCache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
  notificationCache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  userRepository,
  contactRepository,
  invitationRepository,
  notificationRepository,
  documentRepository,
  permissionRepository,
} from '../../src/repositories/index.js';
import { permissionCache } from '../../src/services/CacheService.js';

describe('ContactService', () => {
  let contactService: ContactService;

  beforeEach(() => {
    contactService = new ContactService();
    vi.clearAllMocks();
  });

  describe('searchUsers', () => {
    it('should find user by fuzzy query', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        phone: '1234567890',
      };

      vi.mocked(userRepository.searchByFuzzy).mockResolvedValue([mockUser as any]);
      vi.mocked(contactRepository.findByUserId).mockResolvedValue([]);

      const result = await contactService.searchUsers('test', 'other-user');

      expect(userRepository.searchByFuzzy).toHaveBeenCalledWith('test', 'other-user');
      expect(result.length).toBe(1);
      expect(result[0].username).toBe('testuser');
    });

    it('should return empty array when no user found', async () => {
      vi.mocked(userRepository.searchByFuzzy).mockResolvedValue([]);
      vi.mocked(contactRepository.findByUserId).mockResolvedValue([]);

      const result = await contactService.searchUsers('nonexistent', 'user-123');

      expect(result.length).toBe(0);
    });

    it('should return multiple matches for broad query', async () => {
      const mockUsers = [
        { id: 'user-1', username: 'john_doe', email: 'john@example.com', phone: '111' },
        { id: 'user-2', username: 'johnny', email: 'johnny@test.com', phone: '222' },
      ];

      vi.mocked(userRepository.searchByFuzzy).mockResolvedValue(mockUsers as any);
      vi.mocked(contactRepository.findByUserId).mockResolvedValue([]);

      const result = await contactService.searchUsers('john', 'user-123');

      expect(result.length).toBe(2);
    });
  });

  describe('getContacts', () => {
    it('should return contacts for user', async () => {
      vi.mocked(contactRepository.findByUserId).mockResolvedValue([
        { id: 'contact-1', userId: 'user-123', contactUserId: 'user-456', createdAt: new Date() },
      ] as any);
      vi.mocked(contactRepository.countByUserId).mockResolvedValue(1);
      vi.mocked(userRepository.findByIds).mockResolvedValue([
        { id: 'user-456', username: 'contactuser', email: 'contact@test.com', phone: '5555' },
      ] as any);

      const result = await contactService.getContacts('user-123');

      expect(contactRepository.findByUserId).toHaveBeenCalledWith('user-123', 50, 0);
      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.items[0].username).toBe('contactuser');
    });
  });

  describe('sendInvitation', () => {
    it('should send invitation successfully', async () => {
      vi.mocked(contactRepository.areContacts).mockResolvedValue(false);
      vi.mocked(invitationRepository.existsPendingBetweenUsers).mockResolvedValue(false);
      vi.mocked(userRepository.findById)
        .mockResolvedValueOnce({ id: 'user-456', username: 'Invitee' } as any)
        .mockResolvedValueOnce({ id: 'user-123', username: 'Inviter' } as any);
      vi.mocked(invitationRepository.create).mockResolvedValue({
        id: 'inv-123',
        inviterId: 'user-123',
        inviteeId: 'user-456',
        status: 'pending',
        expiresAt: new Date(),
      } as any);
      vi.mocked(notificationRepository.create).mockResolvedValue({} as any);

      const result = await contactService.sendInvitation('user-123', 'user-456');

      expect(result.inviterId).toBe('user-123');
      expect(result.inviteeId).toBe('user-456');
    });

    it('should throw error when inviting yourself', async () => {
      await expect(contactService.sendInvitation('user-123', 'user-123')).rejects.toThrow(
        ContactError
      );
      await expect(contactService.sendInvitation('user-123', 'user-123')).rejects.toThrow(
        'Cannot send invitation to yourself'
      );
    });

    it('should throw error when invitee not found', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      await expect(contactService.sendInvitation('user-123', 'nonexistent')).rejects.toThrow(
        ContactError
      );
      await expect(contactService.sendInvitation('user-123', 'nonexistent')).rejects.toThrow(
        'User not found'
      );
    });

    it('should throw error when already contacts', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue({ id: 'user-456' } as any);
      vi.mocked(contactRepository.areContacts).mockResolvedValue(true);

      await expect(contactService.sendInvitation('user-123', 'user-456')).rejects.toThrow(
        ContactError
      );
      await expect(contactService.sendInvitation('user-123', 'user-456')).rejects.toThrow(
        'You are already contacts with this user'
      );
    });

    it('should throw error when pending invitation exists', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue({ id: 'user-456' } as any);
      vi.mocked(contactRepository.areContacts).mockResolvedValue(false);
      vi.mocked(invitationRepository.existsPendingBetweenUsers).mockResolvedValue(true);

      await expect(contactService.sendInvitation('user-123', 'user-456')).rejects.toThrow(
        ContactError
      );
      await expect(contactService.sendInvitation('user-123', 'user-456')).rejects.toThrow(
        'A pending invitation already exists'
      );
    });
  });

  describe('acceptInvitation', () => {
    it('should accept invitation successfully', async () => {
      const mockInvitation = {
        id: 'inv-123',
        inviterId: 'user-123',
        inviteeId: 'user-456',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400000),
      };

      vi.mocked(invitationRepository.findById).mockResolvedValue(mockInvitation as any);
      vi.mocked(contactRepository.createBidirectional).mockResolvedValue(undefined);
      vi.mocked(invitationRepository.updateStatus).mockResolvedValue({} as any);
      vi.mocked(userRepository.findById).mockResolvedValue({
        id: 'user-456',
        username: 'Invitee',
      } as any);
      vi.mocked(notificationRepository.create).mockResolvedValue({} as any);

      await expect(contactService.acceptInvitation('inv-123', 'user-456')).resolves.not.toThrow();
      expect(contactRepository.createBidirectional).toHaveBeenCalledWith('user-123', 'user-456', {});
    });

    it('should throw error when invitation not found', async () => {
      vi.mocked(invitationRepository.findById).mockResolvedValue(null);

      await expect(contactService.acceptInvitation('nonexistent', 'user-456')).rejects.toThrow(
        ContactError
      );
    });

    it('should throw error when invitation is for different user', async () => {
      vi.mocked(invitationRepository.findById).mockResolvedValue({
        id: 'inv-123',
        inviterId: 'user-123',
        inviteeId: 'user-789',
      } as any);

      await expect(contactService.acceptInvitation('inv-123', 'user-456')).rejects.toThrow(
        ContactError
      );
      await expect(contactService.acceptInvitation('inv-123', 'user-456')).rejects.toThrow(
        'This invitation is not for you'
      );
    });

    it('should throw error when invitation is expired', async () => {
      vi.mocked(invitationRepository.findById).mockResolvedValue({
        id: 'inv-123',
        inviterId: 'user-123',
        inviteeId: 'user-456',
        status: 'pending',
        expiresAt: new Date(Date.now() - 1000), // Expired
      } as any);

      vi.mocked(invitationRepository.updateStatus).mockResolvedValue({} as any);

      await expect(contactService.acceptInvitation('inv-123', 'user-456')).rejects.toThrow(
        ContactError
      );
      await expect(contactService.acceptInvitation('inv-123', 'user-456')).rejects.toThrow(
        'This invitation has expired'
      );
    });
  });

  describe('declineInvitation', () => {
    it('should decline invitation successfully', async () => {
      vi.mocked(invitationRepository.findById).mockResolvedValue({
        id: 'inv-123',
        inviterId: 'user-123',
        inviteeId: 'user-456',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400000),
      } as any);
      vi.mocked(invitationRepository.updateStatus).mockResolvedValue({} as any);

      await expect(contactService.declineInvitation('inv-123', 'user-456')).resolves.not.toThrow();
      expect(invitationRepository.updateStatus).toHaveBeenCalledWith('inv-123', 'declined');
    });

    it('should throw error when invitation not found', async () => {
      vi.mocked(invitationRepository.findById).mockResolvedValue(null);

      await expect(contactService.declineInvitation('nonexistent', 'user-456')).rejects.toThrow(
        ContactError
      );
    });

    it('should throw error when invitation is for different user', async () => {
      vi.mocked(invitationRepository.findById).mockResolvedValue({
        id: 'inv-123',
        inviteeId: 'user-789',
      } as any);

      await expect(contactService.declineInvitation('inv-123', 'user-456')).rejects.toThrow(
        ContactError
      );
    });
  });

  describe('removeContact', () => {
    it('should remove contact successfully', async () => {
      vi.mocked(contactRepository.areContacts).mockResolvedValue(true);
      vi.mocked(contactRepository.deleteBidirectional).mockResolvedValue(undefined);
      vi.mocked(documentRepository.findByOwnerId).mockResolvedValue([]);

      await expect(contactService.removeContact('user-123', 'user-456')).resolves.not.toThrow();
      expect(contactRepository.deleteBidirectional).toHaveBeenCalledWith('user-123', 'user-456');
    });

    it('should throw error when not a contact', async () => {
      vi.mocked(contactRepository.areContacts).mockResolvedValue(false);

      await expect(contactService.removeContact('user-123', 'user-456')).rejects.toThrow(
        ContactError
      );
      await expect(contactService.removeContact('user-123', 'user-456')).rejects.toThrow(
        'This user is not your contact'
      );
    });

    it('should cascade delete permissions on owned documents when removing contact', async () => {
      const ownedDoc = { id: 'doc-owned', title: 'My Doc', ownerId: 'user-123' };
      const perm = {
        id: 'perm-1',
        documentId: 'doc-owned',
        userId: 'user-456',
        level: 'read-write' as const,
      };

      vi.mocked(contactRepository.areContacts).mockResolvedValue(true);
      vi.mocked(documentRepository.findByOwnerId)
        .mockResolvedValueOnce([ownedDoc] as any)   // my docs (remover)
        .mockResolvedValueOnce([]);                  // their docs (removed user)
      vi.mocked(permissionRepository.findByUserId)
        .mockResolvedValueOnce([perm] as any)        // removed user's permissions
        .mockResolvedValueOnce([]);                  // remover's permissions
      vi.mocked(permissionRepository.delete).mockResolvedValue(true);
      vi.mocked(contactRepository.deleteBidirectional).mockResolvedValue(undefined);

      await expect(contactService.removeContact('user-123', 'user-456')).resolves.not.toThrow();

      // Permissions on owned docs should be cleaned up
      expect(permissionRepository.delete).toHaveBeenCalledWith('perm-1');
      expect(permissionCache.delete).toHaveBeenCalled();
    });
  });
});
