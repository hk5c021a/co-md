import { eq, and, desc, count, inArray, sql } from 'drizzle-orm';
import { db, type Tx } from '../db/index.js';
import { notifications, type Notification } from '../db/schema.js';

export interface CreateNotificationData {
  id: string;
  userId: string;
  type:
    | 'permission-granted'
    | 'permission-revoked'
    | 'permission-changed'
    | 'contact-invitation'
    | 'contact-added'
    | 'contact-removed';
  content: string;
  metadata?: Record<string, unknown>;
}

export class NotificationRepository {
  async findById(id: string, tx?: Tx): Promise<Notification | null> {
    const client = tx ?? db;
    const result = await client.query.notifications.findFirst({
      where: eq(notifications.id, id),
    });
    return result ?? null;
  }

  async findByIds(ids: string[], tx?: Tx): Promise<Notification[]> {
    if (ids.length === 0) return [];
    const client = tx ?? db;
    return client.query.notifications.findMany({
      where: inArray(notifications.id, ids),
    });
  }

  async findByUserId(
    userId: string,
    limit?: number,
    offset?: number,
    tx?: Tx
  ): Promise<Notification[]> {
    const client = tx ?? db;
    return client.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      orderBy: [desc(notifications.createdAt)],
      limit,
      offset,
    });
  }

  async findUnreadByUserId(
    userId: string,
    limit?: number,
    offset?: number,
    tx?: Tx
  ): Promise<Notification[]> {
    const client = tx ?? db;
    return client.query.notifications.findMany({
      where: and(eq(notifications.userId, userId), eq(notifications.read, false)),
      orderBy: [desc(notifications.createdAt)],
      limit,
      offset,
    });
  }

  async countByUserId(userId: string, tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client
      .select({ value: count() })
      .from(notifications)
      .where(eq(notifications.userId, userId));
    return result[0]?.value ?? 0;
  }

  async countUnreadByUserId(userId: string, tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return result[0]?.value ?? 0;
  }

  async create(data: CreateNotificationData, tx?: Tx): Promise<Notification> {
    const client = tx ?? db;
    const [notification] = await client
      .insert(notifications)
      .values({
        id: data.id,
        userId: data.userId,
        type: data.type,
        content: data.content,
        metadata: data.metadata ?? {},
        read: false,
        createdAt: new Date(),
      })
      .returning();
    return notification;
  }

  async markAsRead(id: string, tx?: Tx): Promise<Notification | null> {
    const client = tx ?? db;
    const [notification] = await client
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification ?? null;
  }

  async markAllAsRead(userId: string, tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
      .returning();
    return result.length;
  }

  /** Find the notification associated with an invitation by metadata.invitationId. */
  async findByInvitationId(invitationId: string, tx?: Tx): Promise<Notification | null> {
    const client = tx ?? db;
    const result = await client.query.notifications.findFirst({
      where: sql`${notifications.metadata}->>'invitationId' = ${invitationId}`,
    });
    return result ?? null;
  }

  /** Update the metadata of a notification (shallow merge with existing). */
  async updateMetadata(
    id: string,
    patch: Record<string, unknown>,
    tx?: Tx
  ): Promise<Notification | null> {
    const client = tx ?? db;
    const [updated] = await client
      .update(notifications)
      .set({
        metadata: sql`${notifications.metadata} || ${JSON.stringify(patch)}::jsonb`,
        read: true,
      })
      .where(eq(notifications.id, id))
      .returning();
    return updated ?? null;
  }

  async delete(id: string, tx?: Tx): Promise<boolean> {
    const client = tx ?? db;
    const [deleted] = await client.delete(notifications).where(eq(notifications.id, id)).returning();
    return !!deleted;
  }

  async deleteByUserId(userId: string, tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client
      .delete(notifications)
      .where(eq(notifications.userId, userId))
      .returning();
    return result.length;
  }
}

export const notificationRepository = new NotificationRepository();
