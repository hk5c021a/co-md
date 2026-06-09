import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService, UserError } from '../../src/services/UserService.js';

// -- hoist mocks so factory refs are available at vi.mock time --
const {
  mockFindById,
  mockFindByIdentifier,
  mockFindByUsername,
  mockFindByEmail,
  mockFindByPhone,
  mockExistsByUsername,
  mockExistsByEmail,
  mockExistsByPhone,
  mockUpdate,
  mockDelete,
} = vi.hoisted(() => ({
  mockFindById: vi.fn(),
  mockFindByIdentifier: vi.fn(),
  mockFindByUsername: vi.fn(),
  mockFindByEmail: vi.fn(),
  mockFindByPhone: vi.fn(),
  mockExistsByUsername: vi.fn(),
  mockExistsByEmail: vi.fn(),
  mockExistsByPhone: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$10$newBcryptHash'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../src/repositories/index.js', () => ({
  userRepository: {
    findById: mockFindById,
    findByIdentifier: mockFindByIdentifier,
    findByUsername: mockFindByUsername,
    findByEmail: mockFindByEmail,
    findByPhone: mockFindByPhone,
    existsByUsername: mockExistsByUsername,
    existsByEmail: mockExistsByEmail,
    existsByPhone: mockExistsByPhone,
    update: mockUpdate,
    delete: mockDelete,
  },
  sessionRepository: {
    deleteByUserId: vi.fn(),
  },
}));

vi.mock('../../src/db/redis.js', () => ({
  delTokensByUserId: vi.fn(),
}));

vi.mock('../../src/db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    transaction: vi.fn((fn: (tx: unknown) => Promise<void>) =>
      fn({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        }),
        delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      })
    ),
  },
}));

// Mock CacheService
vi.mock('../../src/services/CacheService.js', () => ({
  userCache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

import bcrypt from 'bcryptjs';
import { userRepository } from '../../src/repositories/index.js';
import { userCache } from '../../src/services/CacheService.js';

const mockUser = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  phone: '1234567890',
  passwordHash: '$2a$10$mockBcryptHash',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
};

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════
  // getProfile
  // ═══════════════════════════════════════════════

  describe('getProfile', () => {
    it('should return user from cache when cached', async () => {
      vi.mocked(userCache.get).mockResolvedValue(mockUser);

      const result = await userService.getProfile('user-123');

      expect(result).toEqual(mockUser);
      expect(userCache.get).toHaveBeenCalledWith('user-123');
      expect(mockFindById).not.toHaveBeenCalled();
    });

    it('should fetch from DB and cache when cache miss', async () => {
      vi.mocked(userCache.get).mockResolvedValue(null);
      mockFindById.mockResolvedValue(mockUser);

      const result = await userService.getProfile('user-123');

      expect(result).toEqual(mockUser);
      expect(userCache.get).toHaveBeenCalledWith('user-123');
      expect(mockFindById).toHaveBeenCalledWith('user-123');
      expect(userCache.set).toHaveBeenCalledWith('user-123', mockUser);
    });

    it('should return null when user not found in cache or DB', async () => {
      vi.mocked(userCache.get).mockResolvedValue(null);
      mockFindById.mockResolvedValue(null);

      const result = await userService.getProfile('nonexistent');

      expect(result).toBeNull();
      expect(userCache.set).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════
  // updateProfile
  // ═══════════════════════════════════════════════

  describe('updateProfile', () => {
    it('should update username successfully', async () => {
      mockFindById.mockResolvedValue(mockUser);
      mockExistsByUsername.mockResolvedValue(false);
      mockUpdate.mockResolvedValue({ ...mockUser, username: 'newuser' });

      const result = await userService.updateProfile('user-123', { username: 'newuser' });

      expect(result.username).toBe('newuser');
      expect(mockUpdate).toHaveBeenCalledWith('user-123', { username: 'newuser' });
      expect(userCache.delete).toHaveBeenCalledWith('user-123');
    });

    it('should update email successfully', async () => {
      mockFindById.mockResolvedValue(mockUser);
      mockExistsByEmail.mockResolvedValue(false);
      mockUpdate.mockResolvedValue({ ...mockUser, email: 'new@example.com' });

      const result = await userService.updateProfile('user-123', { email: 'new@example.com' });

      expect(result.email).toBe('new@example.com');
    });

    it('should throw error when user not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(userService.updateProfile('nonexistent', { username: 'x' })).rejects.toThrow(
        UserError
      );
      await expect(userService.updateProfile('nonexistent', { username: 'x' })).rejects.toThrow(
        'User not found'
      );
    });

    it('should throw error when username is already taken', async () => {
      mockFindById.mockResolvedValue(mockUser);
      mockExistsByUsername.mockResolvedValue(true);

      await expect(userService.updateProfile('user-123', { username: 'taken' })).rejects.toThrow(
        'This username is already taken'
      );
    });

    it('should throw error when email is already registered', async () => {
      mockFindById.mockResolvedValue(mockUser);
      mockExistsByUsername.mockResolvedValue(false);
      mockExistsByEmail.mockResolvedValue(true);

      await expect(
        userService.updateProfile('user-123', { email: 'taken@example.com' })
      ).rejects.toThrow('This email is already registered');
    });

    it('should throw error when phone is already taken', async () => {
      mockFindById.mockResolvedValue(mockUser);
      mockExistsByUsername.mockResolvedValue(false);
      mockExistsByEmail.mockResolvedValue(false);
      mockExistsByPhone.mockResolvedValue(true);

      await expect(userService.updateProfile('user-123', { phone: '9999999999' })).rejects.toThrow(
        'This phone number is already registered'
      );
    });

    it('should skip uniqueness check when field unchanged', async () => {
      mockFindById.mockResolvedValue(mockUser);
      mockUpdate.mockResolvedValue(mockUser);

      await expect(
        userService.updateProfile('user-123', { username: 'testuser' })
      ).resolves.not.toThrow();

      // existsByUsername should NOT be called since username is unchanged
      expect(mockExistsByUsername).not.toHaveBeenCalled();
    });

    it('should throw error when update returns null', async () => {
      mockFindById.mockResolvedValue(mockUser);
      mockUpdate.mockResolvedValue(null);

      await expect(userService.updateProfile('user-123', { username: 'newuser' })).rejects.toThrow(
        'Failed to update profile'
      );
    });
  });

  // ═══════════════════════════════════════════════
  // changePassword
  // ═══════════════════════════════════════════════

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      mockFindById.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);
      vi.mocked(bcrypt.hash).mockResolvedValue('$2a$10$storedHash');

      await expect(
        userService.changePassword('user-123', {
          oldPasswordHash: 'old-hash',
          newPasswordHash: 'new-hash',
          newPbkdf2Salt: 'new-salt-v1',
        })
      ).resolves.not.toThrow();

      expect(bcrypt.compare).toHaveBeenCalledWith('old-hash', mockUser.passwordHash);
      expect(userCache.delete).toHaveBeenCalledWith('user-123');
    });

    it('should throw error when user not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(
        userService.changePassword('nonexistent', {
          oldPasswordHash: 'old',
          newPasswordHash: 'new',
        })
      ).rejects.toThrow('User not found');
    });

    it('should throw error when old password is incorrect', async () => {
      mockFindById.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false);

      await expect(
        userService.changePassword('user-123', {
          oldPasswordHash: 'wrong-old-hash',
          newPasswordHash: 'new-hash',
          newPbkdf2Salt: 'new-salt-v1',
        })
      ).rejects.toThrow('Current password is incorrect');
    });
  });

  // ═══════════════════════════════════════════════
  // existsBy* delegates
  // ═══════════════════════════════════════════════

  describe('existsBy*', () => {
    it('existsByUsername should delegate to repository', async () => {
      mockExistsByUsername.mockResolvedValue(true);
      const result = await userService.existsByUsername('test');
      expect(result).toBe(true);
      expect(mockExistsByUsername).toHaveBeenCalledWith('test');
    });

    it('existsByEmail should delegate to repository', async () => {
      mockExistsByEmail.mockResolvedValue(false);
      const result = await userService.existsByEmail('test@test.com');
      expect(result).toBe(false);
    });

    it('existsByPhone should delegate to repository', async () => {
      mockExistsByPhone.mockResolvedValue(true);
      const result = await userService.existsByPhone('12345');
      expect(result).toBe(true);
    });

    it('existsByIdentifier should return true when user found', async () => {
      mockFindByIdentifier.mockResolvedValue(mockUser);
      const result = await userService.existsByIdentifier('testuser');
      expect(result).toBe(true);
    });

    it('existsByIdentifier should return false when user not found', async () => {
      mockFindByIdentifier.mockResolvedValue(null);
      const result = await userService.existsByIdentifier('nonexistent');
      expect(result).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════
  // searchUsers
  // ═══════════════════════════════════════════════

  describe('searchUsers', () => {
    const otherUser = {
      id: 'user-456',
      username: 'otheruser',
      email: 'other@example.com',
      phone: '5555555555',
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should find user by exact username', async () => {
      mockFindByUsername.mockResolvedValue(otherUser);
      mockFindByEmail.mockResolvedValue(null);
      mockFindByPhone.mockResolvedValue(null);

      const result = await userService.searchUsers('otheruser', 'user-123');

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('otheruser');
    });

    it('should find user by email', async () => {
      mockFindByUsername.mockResolvedValue(null);
      mockFindByEmail.mockResolvedValue(otherUser);
      mockFindByPhone.mockResolvedValue(null);

      const result = await userService.searchUsers('other@example.com', 'user-123');

      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('other@example.com');
    });

    it('should find user by phone', async () => {
      mockFindByUsername.mockResolvedValue(null);
      mockFindByEmail.mockResolvedValue(null);
      mockFindByPhone.mockResolvedValue(otherUser);

      const result = await userService.searchUsers('5555555555', 'user-123');

      expect(result).toHaveLength(1);
      expect(result[0].phone).toBe('5555555555');
    });

    it('should exclude the requester from results', async () => {
      const selfUser = { ...otherUser, id: 'user-123' };
      mockFindByUsername.mockResolvedValue(selfUser);
      mockFindByEmail.mockResolvedValue(null);
      mockFindByPhone.mockResolvedValue(null);

      const result = await userService.searchUsers('testuser', 'user-123');

      // Self should be excluded even when username matches
      expect(result).toHaveLength(0);
    });

    it('should deduplicate when user matches multiple fields', async () => {
      mockFindByUsername.mockResolvedValue(otherUser);
      mockFindByEmail.mockResolvedValue(otherUser); // Same user
      mockFindByPhone.mockResolvedValue(null);

      const result = await userService.searchUsers('other', 'user-123');

      expect(result).toHaveLength(1);
    });

    it('should return empty array when no matches', async () => {
      mockFindByUsername.mockResolvedValue(null);
      mockFindByEmail.mockResolvedValue(null);
      mockFindByPhone.mockResolvedValue(null);

      const result = await userService.searchUsers('nonexistent', 'user-123');

      expect(result).toHaveLength(0);
    });

    it('should return all matches when query matches all three fields for different users', async () => {
      const userA = { ...otherUser, id: 'a', username: 'john', email: 'a@test.com', phone: '111' };
      const userB = { ...otherUser, id: 'b', username: 'b', email: 'john@test.com', phone: '222' };
      const userC = { ...otherUser, id: 'c', username: 'c', email: 'c@test.com', phone: '333' };

      mockFindByUsername.mockResolvedValue(userA);
      mockFindByEmail.mockResolvedValue(userB);
      mockFindByPhone.mockResolvedValue(userC);

      const result = await userService.searchUsers('john', 'user-123');

      expect(result).toHaveLength(3);
    });
  });

  // ═══════════════════════════════════════════════
  // deleteAccount
  // ═══════════════════════════════════════════════

  describe('deleteAccount', () => {
    it('should delete account successfully', async () => {
      mockFindById.mockResolvedValue(mockUser);

      await expect(userService.deleteAccount('user-123')).resolves.not.toThrow();
      expect(userCache.delete).toHaveBeenCalledWith('user-123');
      expect(mockDelete).toHaveBeenCalledWith('user-123');
    });

    it('should throw error when user not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(userService.deleteAccount('nonexistent')).rejects.toThrow('User not found');
    });
  });
});
