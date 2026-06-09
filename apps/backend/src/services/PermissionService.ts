import { randomUUID } from 'node:crypto';
import { auditLog } from '../lib/audit.js';
import {
  permissionRepository,
  documentRepository,
  notificationRepository,
  userRepository,
} from '../repositories/index.js';
import { permissionCache } from './CacheService.js';
import { db } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { publishUserNotification } from './notificationPublisher.js';
import type { Permission } from '../db/schema.js';

export type PermissionLevel = 'read-only' | 'read-write' | 'revoked';

export interface GrantPermissionData {
  documentId: string;
  userId: string;
  level: PermissionLevel;
  grantedBy: string;
}

export interface BatchGrantPermissionData {
  documentId: string;
  permissions: Array<{
    userId: string;
    level: PermissionLevel;
  }>;
  grantedBy: string;
}

export interface UpdatePermissionData {
  level: PermissionLevel;
}

export class PermissionService {
  async grant(data: GrantPermissionData): Promise<Permission> {
    // Verify document exists
    const doc = await documentRepository.findById(data.documentId);
    if (!doc) {
      throw new PermissionError('DOCUMENT_NOT_FOUND', 'Document not found');
    }

    // Verify user exists
    const user = await userRepository.findById(data.userId);
    if (!user) {
      throw new PermissionError('USER_NOT_FOUND', 'User not found');
    }

    // Only owner can grant permissions
    if (doc.ownerId !== data.grantedBy) {
      throw new PermissionError('ACCESS_DENIED', 'Only the document owner can grant permissions');
    }

    // Cannot grant permissions to owner
    if (doc.ownerId === data.userId) {
      throw new PermissionError('INVALID_TARGET', 'Cannot change permissions for document owner');
    }

    // Check if user already has a permission (update vs new grant)
    const existing = await permissionRepository.findByDocumentAndUser(data.documentId, data.userId);

    // Create or update permission
    const permission = await permissionRepository.upsert({
      id: randomUUID(),
      documentId: data.documentId,
      userId: data.userId,
      level: data.level,
      grantedBy: data.grantedBy,
    });

    // Invalidate cache
    await permissionCache.delete(`${data.documentId}:${data.userId}`);

    // Determine the correct event type: was this a new permission or a change?
    let eventType: string;
    if (data.level === 'revoked') {
      eventType = 'permission-revoked';
    } else if (existing && existing.level !== data.level) {
      eventType = 'permission-changed';
    } else {
      eventType = 'permission-granted';
    }

    // Create DB notification with the correct event type + permission level
    await this.createPermissionNotification(data.userId, data.documentId, doc.title, eventType, data.level);

    // Publish real-time notification
    await publishUserNotification(data.userId, {
      type: eventType,
      data: {
        documentId: data.documentId,
        documentTitle: doc.title,
        level: data.level,
        userId: data.userId,
      },
    });

    auditLog('permission.grant', {
      'audit.user_id': data.grantedBy,
      'audit.resource_type': 'permission',
      'audit.resource_id': permission.id,
      'audit.target_user_id': data.userId,
      'audit.level': data.level,
    });
    return permission;
  }

  async batchGrant(data: BatchGrantPermissionData): Promise<Permission[]> {
    // Verify document exists and user owns it
    const doc = await documentRepository.findById(data.documentId);
    if (!doc) {
      throw new PermissionError('DOCUMENT_NOT_FOUND', 'Document not found');
    }

    if (doc.ownerId !== data.grantedBy) {
      throw new PermissionError('ACCESS_DENIED', 'Only the document owner can grant permissions');
    }

    // Wrap in transaction — all-or-nothing across the batch.
    // Notifications are deferred to after commit to avoid ghost notifications on rollback.
    const pendingNotifs: Array<{ userId: string; eventType: string; level: PermissionLevel }> = [];

    // Pre-load all users and existing permissions in bulk (avoids N+1 queries)
    const userIds = data.permissions.filter(p => p.userId !== doc.ownerId).map(p => p.userId);
    const [users, existingPerms] = await Promise.all([
      userIds.length > 0 ? userRepository.findByIds(userIds) : [],
      permissionRepository.findByDocumentId(data.documentId),
    ]);
    const userMap = new Map(users.map(u => [u.id, u]));
    const existingMap = new Map(existingPerms.map(p => [p.userId, p]));

    const results = await db.transaction(async (tx) => {
      const batchResults: Permission[] = [];

      for (const perm of data.permissions) {
        // Cannot grant permissions to owner
        if (doc.ownerId === perm.userId) continue;

        // Verify user exists (pre-loaded)
        if (!userMap.has(perm.userId)) continue;

        // Check if user already has a permission (pre-loaded)
        const existing = existingMap.get(perm.userId);

        const permission = await permissionRepository.upsert({
          id: randomUUID(),
          documentId: data.documentId,
          userId: perm.userId,
          level: perm.level,
          grantedBy: data.grantedBy,
        }, tx);

        batchResults.push(permission);

        // Invalidate cache
        await permissionCache.delete(`${data.documentId}:${perm.userId}`);

        // Defer notifications to after transaction commit (prevents ghost notifications)
        let eventType: string;
        if (perm.level === 'revoked') {
          eventType = 'permission-revoked';
        } else if (existing && existing.level !== perm.level) {
          eventType = 'permission-changed';
        } else {
          eventType = 'permission-granted';
        }
        pendingNotifs.push({ userId: perm.userId, eventType, level: perm.level as PermissionLevel });
      }

      return batchResults;
    });

    // Post-commit: send notifications (best-effort — failure does not roll back)
    for (const n of pendingNotifs) {
      try {
        await this.createPermissionNotification(n.userId, data.documentId, doc.title, n.eventType, n.level);
      } catch (err) {
        logger.warn('Batch grant notification creation failed', { userId: n.userId, error: err });
      }
      publishUserNotification(n.userId, {
        type: n.eventType,
        data: {
          documentId: data.documentId,
          documentTitle: doc.title,
          level: n.level,
          userId: n.userId,
        },
      }).catch((err) => {
        logger.warn('Batch grant notification publish failed', { userId: n.userId, error: err });
      });
    }

    auditLog('permission.batch_grant', {
      'audit.user_id': data.grantedBy,
      'audit.resource_type': 'document',
      'audit.resource_id': data.documentId,
      'audit.count': results.length,
    });
    return results;
  }

  async revoke(permissionId: string, userId: string): Promise<void> {
    const permission = await permissionRepository.findById(permissionId);
    if (!permission) {
      throw new PermissionError('NOT_FOUND', 'Permission not found');
    }

    const doc = await documentRepository.findById(permission.documentId);
    if (!doc) {
      throw new PermissionError('DOCUMENT_NOT_FOUND', 'Document not found');
    }

    // Only owner can revoke permissions
    if (doc.ownerId !== userId) {
      throw new PermissionError('ACCESS_DENIED', 'Only the document owner can revoke permissions');
    }

    await permissionRepository.delete(permissionId);

    // Invalidate cache
    await permissionCache.delete(`${permission.documentId}:${permission.userId}`);

    // Notify user
    await this.createPermissionNotification(permission.userId, doc.id, doc.title, 'permission-revoked');

    // Publish real-time notification
    await publishUserNotification(permission.userId, {
      type: 'permission-revoked',
      data: {
        documentId: doc.id,
        documentTitle: doc.title,
        level: 'revoked',
        userId: permission.userId,
      },
    });

    auditLog('permission.revoke', {
      'audit.user_id': userId,
      'audit.resource_type': 'permission',
      'audit.resource_id': doc.id,
      'audit.target_user_id': permission.userId,
    });
  }

  async leaveDocument(documentId: string, userId: string): Promise<void> {
    // A user revokes their own permission on a document
    const deleted = await permissionRepository.deleteByDocumentAndUser(documentId, userId);
    if (!deleted) {
      throw new PermissionError('NOT_FOUND', 'Permission not found');
    }

    // Invalidate cache
    await permissionCache.delete(`${documentId}:${userId}`);

    auditLog('permission.leave', {
      'audit.user_id': userId,
      'audit.resource_type': 'document',
      'audit.resource_id': documentId,
    });
  }

  async revokeByDocumentAndUser(
    documentId: string,
    targetUserId: string,
    userId: string
  ): Promise<void> {
    const doc = await documentRepository.findById(documentId);
    if (!doc) {
      throw new PermissionError('DOCUMENT_NOT_FOUND', 'Document not found');
    }

    if (doc.ownerId !== userId) {
      throw new PermissionError('ACCESS_DENIED', 'Only the document owner can revoke permissions');
    }

    const deleted = await permissionRepository.deleteByDocumentAndUser(documentId, targetUserId);
    if (!deleted) {
      throw new PermissionError('NOT_FOUND', 'Permission not found');
    }

    // Invalidate cache
    await permissionCache.delete(`${documentId}:${targetUserId}`);

    // Notify user
    await this.createPermissionNotification(targetUserId, doc.id, doc.title, 'permission-revoked');

    // Publish real-time notification
    await publishUserNotification(targetUserId, {
      type: 'permission-revoked',
      data: {
        documentId: doc.id,
        documentTitle: doc.title,
        level: 'revoked',
        userId: targetUserId,
      },
    });
  }

  async getDocumentPermissions(documentId: string, userId: string): Promise<any[]> {
    // Only owner can view all permissions
    const doc = await documentRepository.findById(documentId);
    if (!doc) {
      throw new PermissionError('DOCUMENT_NOT_FOUND', 'Document not found');
    }

    if (doc.ownerId !== userId) {
      throw new PermissionError(
        'ACCESS_DENIED',
        'Only the document owner can view all permissions'
      );
    }

    const permissions = await permissionRepository.findByDocumentId(documentId);
    // Join user info for display (username)
    const userIds = [...new Set(permissions.map((p) => p.userId))];
    const users = await Promise.all(userIds.map((id) => userRepository.findById(id)));
    const userMap = new Map(users.filter(Boolean).map((u) => [u!.id, { id: u!.id, username: u!.username }]));

    return permissions.map((p) => ({
      ...p,
      user: userMap.get(p.userId) || null,
    }));
  }

  async getMyPermissions(userId: string): Promise<Permission[]> {
    return permissionRepository.findByUserId(userId);
  }

  async getPermission(documentId: string, userId: string): Promise<Permission | null> {
    return permissionRepository.findByDocumentAndUser(documentId, userId);
  }

  async getPermissionLevel(documentId: string, userId: string): Promise<string | null> {
    const cacheKey = `${documentId}:${userId}`;

    // Try cache first
    const cached = await permissionCache.get<string>(cacheKey);
    if (cached !== null) return cached;

    const doc = await documentRepository.findById(documentId);
    if (!doc) return null;

    if (doc.ownerId === userId) {
      await permissionCache.set(cacheKey, 'owner');
      return 'owner';
    }

    const permission = await permissionRepository.findByDocumentAndUser(documentId, userId);
    const level = permission?.level ?? null;

    if (level) {
      await permissionCache.set(cacheKey, level);
    }

    return level;
  }

  async checkAccess(
    documentId: string,
    userId: string,
    requiredLevels: string[]
  ): Promise<boolean> {
    const level = await this.getPermissionLevel(documentId, userId);
    if (!level) return false;

    // Owner has all access
    if (level === 'owner') return true;

    return requiredLevels.includes(level);
  }

  private async createPermissionNotification(
    userId: string,
    documentId: string,
    documentTitle: string,
    eventType: string,
    level?: string
  ): Promise<void> {
    let content: string;
    let type: 'permission-granted' | 'permission-revoked' | 'permission-changed';

    switch (eventType) {
      case 'permission-changed':
        content = `Your access to "${documentTitle}" has been changed to ${level || 'a new level'}`;
        type = 'permission-changed';
        break;
      case 'permission-granted':
        content = `You have been granted ${level || ''} access to "${documentTitle}"`;
        type = 'permission-granted';
        break;
      case 'permission-revoked':
        content = `Your access to "${documentTitle}" has been revoked`;
        type = 'permission-revoked';
        break;
      default:
        content = `Your permission for "${documentTitle}" has been updated`;
        type = 'permission-changed';
    }

    await notificationRepository.create({
      id: randomUUID(),
      userId,
      type,
      content,
      metadata: { documentId, documentTitle, level },
    });
  }
}

export class PermissionError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'PermissionError';
  }
}

export const permissionService = new PermissionService();
