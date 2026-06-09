import { eq, and, or, count } from 'drizzle-orm';
import { db, type Tx } from '../db/index.js';
import { contacts, type Contact } from '../db/schema.js';

export interface CreateContactData {
  id: string;
  userId: string;
  contactUserId: string;
}

export class ContactRepository {
  async findById(id: string, tx?: Tx): Promise<Contact | null> {
    const client = tx ?? db;
    const result = await client.query.contacts.findFirst({
      where: eq(contacts.id, id),
    });
    return result ?? null;
  }

  async findByUserId(userId: string, limit?: number, offset?: number, tx?: Tx): Promise<Contact[]> {
    const client = tx ?? db;
    return client.query.contacts.findMany({
      where: eq(contacts.userId, userId),
      limit,
      offset,
    });
  }

  async countByUserId(userId: string, tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client
      .select({ value: count() })
      .from(contacts)
      .where(eq(contacts.userId, userId));
    return result[0]?.value ?? 0;
  }

  async findByUserAndContact(userId: string, contactUserId: string, tx?: Tx): Promise<Contact | null> {
    const client = tx ?? db;
    const result = await client.query.contacts.findFirst({
      where: and(eq(contacts.userId, userId), eq(contacts.contactUserId, contactUserId)),
    });
    return result ?? null;
  }

  async areContacts(userId1: string, userId2: string, tx?: Tx): Promise<boolean> {
    const contact = await this.findByUserAndContact(userId1, userId2, tx);
    return !!contact;
  }

  async create(data: CreateContactData, tx?: Tx): Promise<Contact> {
    const client = tx ?? db;
    const [contact] = await client
      .insert(contacts)
      .values({
        id: data.id,
        userId: data.userId,
        contactUserId: data.contactUserId,
        createdAt: new Date(),
      })
      .returning();
    return contact;
  }

  /** Create bidirectional contact rows. MUST be called within a transaction (tx) to
   *  prevent partial inserts on unique-constraint violations. */
  async createBidirectional(userId1: string, userId2: string, tx?: Tx): Promise<Contact[]> {
    const client = tx ?? db;
    const id1 = `${userId1}-${userId2}`;
    const id2 = `${userId2}-${userId1}`;
    const now = new Date();

    const [contact1, contact2] = await client
      .insert(contacts)
      .values([
        { id: id1, userId: userId1, contactUserId: userId2, createdAt: now },
        { id: id2, userId: userId2, contactUserId: userId1, createdAt: now },
      ])
      .returning();

    return [contact1, contact2];
  }

  async delete(id: string, tx?: Tx): Promise<boolean> {
    const client = tx ?? db;
    const [deleted] = await client.delete(contacts).where(eq(contacts.id, id)).returning();
    return !!deleted;
  }

  async deleteByUserAndContact(userId: string, contactUserId: string, tx?: Tx): Promise<boolean> {
    const client = tx ?? db;
    const [deleted] = await client
      .delete(contacts)
      .where(and(eq(contacts.userId, userId), eq(contacts.contactUserId, contactUserId)))
      .returning();
    return !!deleted;
  }

  async deleteBidirectional(userId1: string, userId2: string, tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client
      .delete(contacts)
      .where(
        or(
          and(eq(contacts.userId, userId1), eq(contacts.contactUserId, userId2)),
          and(eq(contacts.userId, userId2), eq(contacts.contactUserId, userId1))
        )
      )
      .returning();
    return result.length;
  }

  async deleteByUserId(userId: string, tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client.delete(contacts).where(eq(contacts.userId, userId)).returning();
    return result.length;
  }
}

export const contactRepository = new ContactRepository();
