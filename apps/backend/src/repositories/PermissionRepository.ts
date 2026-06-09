import { eq, and, or } from 'drizzle-orm';
import { db, type Tx } from '../db/index.js';
import { permissions, type Permission } from '../db/schema.js';

export interface CreatePermissionData {
  id: string;
  documentId: string;
  userId: string;
  level: 'read-only' | 'read-write' | 'revoked';
  grantedBy: string;
}

export interface UpdatePermissionData {
  level: 'read-only' | 'read-write' | 'revoked';
}

export class PermissionRepository {
  async findById(id: string, tx?: Tx): Promise<Permission | null> {
    const client = tx ?? db;
    const result = await client.query.permissions.findFirst({
      where: eq(permissions.id, id),
    });
    return result ?? null;
  }

  async findByDocumentAndUser(documentId: string, userId: string, tx?: Tx): Promise<Permission | null> {
    const client = tx ?? db;
    const result = await client.query.permissions.findFirst({
      where: and(eq(permissions.documentId, documentId), eq(permissions.userId, userId)),
    });
    return result ?? null;
  }

  async findByDocumentId(documentId: string, tx?: Tx): Promise<Permission[]> {
    const client = tx ?? db;
    return client.query.permissions.findMany({
      where: eq(permissions.documentId, documentId),
    });
  }

  async findByUserId(userId: string, tx?: Tx): Promise<Permission[]> {
    const client = tx ?? db;
    return client.query.permissions.findMany({
      where: eq(permissions.userId, userId),
    });
  }

  async findByGrantedBy(grantedBy: string, tx?: Tx): Promise<Permission[]> {
    const client = tx ?? db;
    return client.query.permissions.findMany({
      where: eq(permissions.grantedBy, grantedBy),
    });
  }

  async findDocumentIdsByUserId(userId: string, tx?: Tx): Promise<string[]> {
    const userPermissions = await this.findByUserId(userId, tx);
    return userPermissions.map((p) => p.documentId);
  }

  async create(data: CreatePermissionData, tx?: Tx): Promise<Permission> {
    const client = tx ?? db;
    const now = new Date();
    const [permission] = await client
      .insert(permissions)
      .values({
        id: data.id,
        documentId: data.documentId,
        userId: data.userId,
        level: data.level,
        grantedBy: data.grantedBy,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return permission;
  }

  async upsert(data: CreatePermissionData, tx?: Tx): Promise<Permission> {
    const client = tx ?? db;
    const now = new Date();
    const [permission] = await client
      .insert(permissions)
      .values({
        id: data.id,
        documentId: data.documentId,
        userId: data.userId,
        level: data.level,
        grantedBy: data.grantedBy,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [permissions.documentId, permissions.userId],
        set: {
          level: data.level,
          grantedBy: data.grantedBy,
          updatedAt: new Date(),
        },
      })
      .returning();
    return permission;
  }

  async update(id: string, data: UpdatePermissionData, tx?: Tx): Promise<Permission | null> {
    const client = tx ?? db;
    const [permission] = await client
      .update(permissions)
      .set({
        level: data.level,
        updatedAt: new Date(),
      })
      .where(eq(permissions.id, id))
      .returning();
    return permission ?? null;
  }

  async delete(id: string, tx?: Tx): Promise<boolean> {
    const client = tx ?? db;
    const [deleted] = await client.delete(permissions).where(eq(permissions.id, id)).returning();
    return !!deleted;
  }

  async deleteByDocumentAndUser(documentId: string, userId: string, tx?: Tx): Promise<boolean> {
    const client = tx ?? db;
    const [deleted] = await client
      .delete(permissions)
      .where(and(eq(permissions.documentId, documentId), eq(permissions.userId, userId)))
      .returning();
    return !!deleted;
  }

  async deleteByDocumentId(documentId: string, tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client
      .delete(permissions)
      .where(eq(permissions.documentId, documentId))
      .returning();
    return result.length;
  }

  async deleteByUserId(userId: string, tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client.delete(permissions).where(eq(permissions.userId, userId)).returning();
    return result.length;
  }
}

export const permissionRepository = new PermissionRepository();
