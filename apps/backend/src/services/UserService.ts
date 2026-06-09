import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { userRepository, sessionRepository, contactRepository } from '../repositories/index.js';
import { delTokensByUserId, blacklistSession } from '../db/redis.js';
import { auditLog } from '../lib/audit.js';
import { db } from '../db/index.js';
import { users, sessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { userCache } from './CacheService.js';
import type { User } from '../db/schema.js';

function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

export interface UpdateProfileData {
  username?: string;
  email?: string;
  phone?: string;
}

export interface ChangePasswordData {
  oldPasswordHash: string;
  newPasswordHash: string;
  newPbkdf2Salt: string;
}

export class UserService {
  async getProfile(userId: string): Promise<User | null> {
    // Try cache first
    const cached = await userCache.get<User>(userId);
    if (cached) return cached;

    // Fetch from DB
    const user = await userRepository.findById(userId);
    if (user) {
      await userCache.set(userId, user);
    }
    return user;
  }

  async updateProfile(userId: string, data: UpdateProfileData): Promise<User> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new UserError('NOT_FOUND', 'User not found');
    }

    // Check username uniqueness if updating username
    if (data.username && data.username !== user.username) {
      if (await userRepository.existsByUsername(data.username)) {
        throw new UserError('USERNAME_TAKEN', 'This username is already taken');
      }
    }

    // Check email uniqueness if updating email
    if (data.email && data.email !== user.email) {
      if (await userRepository.existsByEmail(data.email)) {
        throw new UserError('EMAIL_TAKEN', 'This email is already registered');
      }
    }

    // Check phone uniqueness if updating phone
    if (data.phone && data.phone !== user.phone) {
      if (await userRepository.existsByPhone(data.phone)) {
        throw new UserError('PHONE_TAKEN', 'This phone number is already registered');
      }
    }

    let updated: User | null;
    try {
      updated = await userRepository.update(userId, data);
    } catch (err) {
      // Catch unique-violation from concurrent update (TOCTOU guard)
      if (isPgError(err) && err.code === '23505') {
        const constraint = (err as { constraint?: string }).constraint || '';
        if (constraint.includes('username')) throw new UserError('USERNAME_TAKEN', 'This username is already taken');
        if (constraint.includes('email')) throw new UserError('EMAIL_TAKEN', 'This email is already registered');
        if (constraint.includes('phone')) throw new UserError('PHONE_TAKEN', 'This phone number is already registered');
      }
      throw err;
    }
    if (!updated) {
      throw new UserError('UPDATE_FAILED', 'Failed to update profile');
    }

    // Invalidate cache
    await userCache.delete(userId);

    auditLog('user.update_profile', { 'audit.user_id': userId });
    return updated;
  }

  /** Lightweight current-password check — does NOT mutate anything. */
  async verifyPassword(userId: string, passwordHash: string): Promise<boolean> {
    const user = await userRepository.findById(userId);
    if (!user) return false;
    return bcrypt.compare(passwordHash, user.passwordHash);
  }

  async changePassword(userId: string, data: ChangePasswordData): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new UserError('NOT_FOUND', 'User not found');
    }

    // Reject identical passwords (same PBKDF2 input produces the same hash)
    if (data.oldPasswordHash === data.newPasswordHash) {
      throw new UserError('PASSWORD_NOT_DIFFERENT', 'New password must differ from the current password');
    }

    // Verify old PBKDF2 hash against stored bcrypt hash (must use bcrypt here
    // because registration and login both use bcrypt — mixing with argon2 would
    // make verification fail on every call).
    const isValid = await bcrypt.compare(data.oldPasswordHash, user.passwordHash);
    if (!isValid) {
      throw new UserError('INVALID_PASSWORD', 'Current password is incorrect');
    }

    // bcrypt hash the new PBKDF2 hash for storage (same algorithm as registration)
    const storedHash = await bcrypt.hash(data.newPasswordHash, 10);
    // Collect session IDs before deletion (for token blacklisting)
    const userSessions = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
    // Update password + salt + invalidate sessions atomically.
    // The frontend generates a fresh random salt for the new password so that
    // the PBKDF2 input changes even if the raw password stays the same.
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: storedHash, pbkdf2Salt: data.newPbkdf2Salt, updatedAt: new Date() })
        .where(eq(users.id, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    });
    await delTokensByUserId(userId);
    await userCache.delete(userId);
    // Blacklist all sessions for this user (access token revocation)
    for (const s of userSessions) {
      await blacklistSession(s.id);
    }

    auditLog('user.change_password', { 'audit.user_id': userId });
  }

  async existsByUsername(username: string): Promise<boolean> {
    return userRepository.existsByUsername(username);
  }

  async existsByEmail(email: string): Promise<boolean> {
    return userRepository.existsByEmail(email);
  }

  async existsByPhone(phone: string): Promise<boolean> {
    return userRepository.existsByPhone(phone);
  }

  async existsByIdentifier(identifier: string): Promise<boolean> {
    const user = await userRepository.findByIdentifier(identifier);
    return user !== null;
  }

  async getUserByIdentifier(identifier: string): Promise<User | null> {
    return userRepository.findByIdentifier(identifier);
  }

  async searchUsers(
    query: string,
    excludeUserId: string,
    currentUserId?: string
  ): Promise<Partial<User>[]> {
    const results: User[] = [];

    // Try username match
    const usernameMatch = await userRepository.findByUsername(query);
    if (usernameMatch && usernameMatch.id !== excludeUserId) {
      results.push(usernameMatch);
    }

    // Try email match
    const emailMatch = await userRepository.findByEmail(query);
    if (
      emailMatch &&
      emailMatch.id !== excludeUserId &&
      !results.find((u) => u.id === emailMatch.id)
    ) {
      results.push(emailMatch);
    }

    // Try phone match
    const phoneMatch = await userRepository.findByPhone(query);
    if (
      phoneMatch &&
      phoneMatch.id !== excludeUserId &&
      !results.find((u) => u.id === phoneMatch.id)
    ) {
      results.push(phoneMatch);
    }

    // Privacy: mask email/phone for non-contacts
    if (currentUserId) {
      const contactIds = new Set(
        (await contactRepository.findByUserId(currentUserId)).map((c) => c.contactUserId)
      );
      return results.map((user) => {
        if (user.id === currentUserId || contactIds.has(user.id)) {
          return user;
        }
        return {
          ...user,
          email: maskEmail(user.email),
          phone: maskPhone(user.phone),
        };
      });
    }

    return results;
  }

  async deleteAccount(userId: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) throw new UserError('NOT_FOUND', 'User not found');

    // Revoke all live refresh tokens before deleting the user
    await delTokensByUserId(userId);

    // FK onDelete: cascade handles documents, permissions, notifications, contacts, invitations, sessions
    await userRepository.delete(userId);
    await userCache.delete(userId);

    auditLog('user.delete_account', { 'audit.user_id': userId });
  }
}

export class UserError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'UserError';
  }
}

// ── Privacy: mask PII for non-contact search results ──

function maskEmail(email: string): string {
  const atIdx = email.indexOf('@');
  if (atIdx === -1) return '***@***';
  // Mask local part while preserving domain for context
  return email.slice(0, 1) + '***' + email.slice(atIdx);
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  // For short numbers (< 8 chars), reveal fewer characters to prevent reconstruction
  if (phone.length < 8) return phone.slice(0, 1) + '***' + phone.slice(-1);
  return phone.slice(0, 3) + '****' + phone.slice(-3);
}

export const userService = new UserService();
