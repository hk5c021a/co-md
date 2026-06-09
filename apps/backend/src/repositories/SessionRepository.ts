import { eq, and, gt, lte } from 'drizzle-orm';
import { db, type Tx } from '../db/index.js';
import { sessions, type Session } from '../db/schema.js';

export interface CreateSessionData {
  id: string;
  userId: string;
  refreshTokenHash: string;
  tokenFamilyId: string;
  revoked?: boolean;
  bindingHash?: string;
  bindingPlatform?: string;
  bindingCores?: number;
  deviceInfo?: string;
  expiresAt: Date;
}

export interface UpdateSessionData {
  refreshTokenHash: string;
  tokenFamilyId: string;
  expiresAt: Date;
}

export class SessionRepository {
  async findById(id: string, tx?: Tx): Promise<Session | null> {
    const client = tx ?? db;
    const result = await client.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    return result ?? null;
  }

  async findByRefreshTokenHash(hash: string, tx?: Tx): Promise<Session | null> {
    const client = tx ?? db;
    const now = new Date();
    const result = await client.query.sessions.findFirst({
      where: and(
        eq(sessions.refreshTokenHash, hash),
        eq(sessions.revoked, false),
        gt(sessions.expiresAt, now)
      ),
    });
    return result ?? null;
  }

  async findByUserId(userId: string, tx?: Tx): Promise<Session[]> {
    const client = tx ?? db;
    return client.query.sessions.findMany({
      where: eq(sessions.userId, userId),
    });
  }

  async create(data: CreateSessionData, tx?: Tx): Promise<Session> {
    const client = tx ?? db;
    const [session] = await client
      .insert(sessions)
      .values({
        id: data.id,
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        tokenFamilyId: data.tokenFamilyId,
        revoked: data.revoked ?? false,
        bindingHash: data.bindingHash ?? '',
        bindingPlatform: data.bindingPlatform ?? '',
        bindingCores: data.bindingCores ?? 0,
        deviceInfo: data.deviceInfo,
        createdAt: new Date(),
        expiresAt: data.expiresAt,
      })
      .returning();
    return session;
  }

  async updateSession(id: string, data: UpdateSessionData, tx?: Tx): Promise<Session | null> {
    const client = tx ?? db;
    const [session] = await client
      .update(sessions)
      .set({
        refreshTokenHash: data.refreshTokenHash,
        tokenFamilyId: data.tokenFamilyId,
        expiresAt: data.expiresAt,
      })
      .where(eq(sessions.id, id))
      .returning();
    return session ?? null;
  }

  async revoke(id: string, tx?: Tx): Promise<boolean> {
    const client = tx ?? db;
    const [session] = await client
      .update(sessions)
      .set({ revoked: true })
      .where(eq(sessions.id, id))
      .returning();
    return !!session;
  }

  async deleteByUserId(userId: string, tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client.delete(sessions).where(eq(sessions.userId, userId)).returning();
    return result.length;
  }

  async delete(id: string, tx?: Tx): Promise<boolean> {
    const client = tx ?? db;
    const [deleted] = await client.delete(sessions).where(eq(sessions.id, id)).returning();
    return !!deleted;
  }

  async deleteExpired(tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client.delete(sessions).where(lte(sessions.expiresAt, new Date())).returning();
    return result.length;
  }
}

export const sessionRepository = new SessionRepository();
