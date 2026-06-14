import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { auditLog } from '../lib/audit.js';
import { documents, documentFiles, permissions } from '../db/schema.js';
import { documentRepository, permissionRepository } from '../repositories/index.js';
import { deleteFromStorage } from '../lib/storage.js';
import { logger } from '../lib/logger.js';
import { publishUserNotification } from './notificationPublisher.js';
import type { Document } from '../db/schema.js';

export interface CreateDocumentData {
  title: string;
  content?: unknown;
  ownerId: string;
}

export interface UpdateDocumentData {
  title?: string;
  content?: unknown;
  version?: string;
}

export class DocumentService {
  async create(data: CreateDocumentData): Promise<Document> {
    const document = await documentRepository.create({
      id: randomUUID(),
      title: data.title,
      content: data.content,
      ownerId: data.ownerId,
    });
    auditLog('document.create', {
      'audit.user_id': data.ownerId,
      'audit.resource_type': 'document',
      'audit.resource_id': document.id,
    });
    return document;
  }

  async getById(id: string): Promise<Document | null> {
    return documentRepository.findById(id);
  }

  async getAllForUser(
    userId: string,
    limit = 50,
    offset = 0
  ): Promise<{ items: (Document & { permissionLevel?: string })[]; total: number }> {
    // Get owned documents with DB-level pagination
    const [owned, ownedTotal] = await Promise.all([
      documentRepository.findByOwnerId(userId, limit, offset),
      documentRepository.countByOwnerId(userId),
    ]);

    const ownedWithLevel: (Document & { permissionLevel?: string })[] = owned;

    // Get shared documents with permission levels (limited by IDs)
    const userPermissions = await permissionRepository.findByUserId(userId);
    const permMap = new Map(userPermissions.map((p) => [p.documentId, p.level]));

    const sharedDocIds = [...permMap.keys()];
    const sharedTotal = sharedDocIds.length;
    const total = ownedTotal + sharedTotal;

    // If owned results fill all limit slots, return owned only
    if (owned.length >= limit) {
      return { items: ownedWithLevel, total };
    }

    // Fetch shared docs with sliced IDs (DB-level IN filter)
    const remainingSlots = limit - owned.length;
    const sharedOffset = Math.max(0, offset - ownedTotal);
    const sharedIdsSlice = sharedDocIds.slice(sharedOffset, sharedOffset + remainingSlots);
    const shared = sharedIdsSlice.length > 0 ? await documentRepository.findByIds(sharedIdsSlice) : [];

    // Merge and deduplicate, attaching permission level for shared docs
    const items = [...ownedWithLevel];
    for (const doc of shared) {
      if (!items.find((d) => d.id === doc.id)) {
        items.push({ ...doc, permissionLevel: permMap.get(doc.id) });
      }
    }

    return { items, total };
  }

  async getAccessibleDocuments(
    userId: string,
    levels: string[] = ['owner', 'read-write', 'read-only']
  ): Promise<Document[]> {
    // Get owned documents
    const owned = await documentRepository.findByOwnerId(userId);

    // Get shared documents with appropriate permissions
    const userPermissions = await permissionRepository.findByUserId(userId);
    const accessibleIds = userPermissions
      .filter((p) => levels.includes(p.level))
      .map((p) => p.documentId);

    const shared =
      accessibleIds.length > 0 ? await documentRepository.findByIds(accessibleIds) : [];

    // Merge and deduplicate
    const allDocs = [...owned];
    for (const doc of shared) {
      if (!allDocs.find((d) => d.id === doc.id)) {
        allDocs.push(doc);
      }
    }

    return allDocs;
  }

  async update(id: string, userId: string, data: UpdateDocumentData): Promise<Document> {
    // Check access
    const hasAccess = await this.hasAccess(id, userId, ['owner', 'read-write']);
    if (!hasAccess) {
      throw new DocumentError('ACCESS_DENIED', 'You do not have permission to edit this document');
    }

    const doc = await documentRepository.update(id, data);
    if (!doc) {
      throw new DocumentError('NOT_FOUND', 'Document not found');
    }

    auditLog('document.update', {
      'audit.user_id': userId,
      'audit.resource_type': 'document',
      'audit.resource_id': id,
    });
    return doc;
  }

  async delete(id: string, userId: string): Promise<void> {
    // ── Step 1: Verify ownership + existence ──
    const doc = await documentRepository.findById(id);
    if (!doc) throw new DocumentError('NOT_FOUND', 'Document not found');
    if (doc.ownerId !== userId) {
      throw new DocumentError('ACCESS_DENIED', 'Only the owner can delete a document');
    }

    // ── Step 2: Collect affected users BEFORE deleting permissions ──
    // We need to notify everyone who had access so their UI updates in real-time.
    const perms = await db
      .select({ userId: permissions.userId })
      .from(permissions)
      .where(eq(permissions.documentId, id));
    const affectedUsers = perms
      .map((p) => p.userId)
      .filter((uid) => uid !== userId); // owner handles their own UI via mutation

    // ── Step 3: Clean up RustFS storage objects ──
    const files = await db
      .select({ objectKey: documentFiles.objectKey })
      .from(documentFiles)
      .where(eq(documentFiles.documentId, id));

    for (const file of files) {
      try {
        await deleteFromStorage(file.objectKey);
      } catch (err) {
        logger.error(
          { err, objectKey: file.objectKey, documentId: id },
          'Failed to delete S3 object during document deletion'
        );
      }
    }

    // ── Step 4: Delete document (DB CASCADE handles permissions + document_files) ──
    await db
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.ownerId, userId)));

    auditLog('document.delete', {
      'audit.user_id': userId,
      'audit.resource_type': 'document',
      'audit.resource_id': id,
    });

    // ── Step 5: Notify all affected users in real-time ──
    // Fire-and-forget — notification failures don't roll back the deletion.
    for (const uid of affectedUsers) {
      publishUserNotification(uid, {
        type: 'document-deleted',
        data: { documentId: id, documentTitle: doc.title },
      }).catch((err) =>
        logger.error({ err, userId: uid, documentId: id }, 'Failed to notify user of document deletion')
      );
    }
  }

  async hasAccess(
    documentId: string,
    userId: string,
    levels: string[] = ['owner', 'read-write', 'read-only']
  ): Promise<boolean> {
    // Check ownership
    const doc = await documentRepository.findById(documentId);
    if (!doc) return false;

    if (doc.ownerId === userId) return true;

    // Check permissions
    const permission = await permissionRepository.findByDocumentAndUser(documentId, userId);
    if (!permission) return false;

    return levels.includes(permission.level);
  }

  async checkNameDuplicate(userId: string, title: string, excludeId?: string): Promise<boolean> {
    const existing = await documentRepository.findByOwnerIdAndTitle(userId, title, excludeId);
    return existing !== null;
  }

  async getPermissionLevel(documentId: string, userId: string): Promise<string | null> {
    const doc = await documentRepository.findById(documentId);
    if (!doc) return null;

    if (doc.ownerId === userId) return 'owner';

    const permission = await permissionRepository.findByDocumentAndUser(documentId, userId);
    return permission?.level ?? null;
  }
}

export class DocumentError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'DocumentError';
  }
}

export const documentService = new DocumentService();
