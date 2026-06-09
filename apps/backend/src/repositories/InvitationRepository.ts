import { eq, and, or, lt, gt } from 'drizzle-orm';
import { db, type Tx } from '../db/index.js';
import { contactInvitations, type ContactInvitation } from '../db/schema.js';

export interface CreateInvitationData {
  id: string;
  inviterId: string;
  inviteeId: string;
  expiresAt: Date;
}

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export class InvitationRepository {
  async findById(id: string, tx?: Tx): Promise<ContactInvitation | null> {
    const client = tx ?? db;
    const result = await client.query.contactInvitations.findFirst({
      where: eq(contactInvitations.id, id),
    });
    return result ?? null;
  }

  async findByInviteeId(inviteeId: string, tx?: Tx): Promise<ContactInvitation[]> {
    const client = tx ?? db;
    return client.query.contactInvitations.findMany({
      where: eq(contactInvitations.inviteeId, inviteeId),
    });
  }

  async findByInviterId(inviterId: string, tx?: Tx): Promise<ContactInvitation[]> {
    const client = tx ?? db;
    return client.query.contactInvitations.findMany({
      where: eq(contactInvitations.inviterId, inviterId),
    });
  }

  async findPendingByInviteeId(inviteeId: string, tx?: Tx): Promise<ContactInvitation[]> {
    const client = tx ?? db;
    const now = new Date();
    return client.query.contactInvitations.findMany({
      where: and(
        eq(contactInvitations.inviteeId, inviteeId),
        eq(contactInvitations.status, 'pending'),
        gt(contactInvitations.expiresAt, now)
      ),
    });
  }

  async create(data: CreateInvitationData, tx?: Tx): Promise<ContactInvitation> {
    const client = tx ?? db;
    const [invitation] = await client
      .insert(contactInvitations)
      .values({
        id: data.id,
        inviterId: data.inviterId,
        inviteeId: data.inviteeId,
        status: 'pending',
        expiresAt: data.expiresAt,
        createdAt: new Date(),
      })
      .returning();
    return invitation;
  }

  async updateStatus(id: string, status: InvitationStatus, tx?: Tx): Promise<ContactInvitation | null> {
    const client = tx ?? db;
    const [invitation] = await client
      .update(contactInvitations)
      .set({ status })
      .where(eq(contactInvitations.id, id))
      .returning();
    return invitation ?? null;
  }

  async delete(id: string, tx?: Tx): Promise<boolean> {
    const client = tx ?? db;
    const [deleted] = await client
      .delete(contactInvitations)
      .where(eq(contactInvitations.id, id))
      .returning();
    return !!deleted;
  }

  async deleteExpired(tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const now = new Date();
    const result = await client
      .delete(contactInvitations)
      .where(and(eq(contactInvitations.status, 'pending'), lt(contactInvitations.expiresAt, now)))
      .returning();
    return result.length;
  }

  async existsPendingBetweenUsers(inviterId: string, inviteeId: string, tx?: Tx): Promise<boolean> {
    const client = tx ?? db;
    const now = new Date();
    const result = await client.query.contactInvitations.findFirst({
      where: and(
        eq(contactInvitations.inviterId, inviterId),
        eq(contactInvitations.inviteeId, inviteeId),
        eq(contactInvitations.status, 'pending'),
        gt(contactInvitations.expiresAt, now)
      ),
    });
    return !!result;
  }
}

export const invitationRepository = new InvitationRepository();
