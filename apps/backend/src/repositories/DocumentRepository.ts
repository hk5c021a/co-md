import { eq, ne, and, or, desc, isNull, count, inArray } from 'drizzle-orm';
import { db, type Tx } from '../db/index.js';
import { documents, type Document } from '../db/schema.js';

export interface CreateDocumentData {
  id: string;
  title: string;
  content?: unknown;
  ownerId: string;
}

export interface UpdateDocumentData {
  title?: string;
  content?: unknown;
  version?: string;
}

export class DocumentRepository {
  async findById(id: string, tx?: Tx): Promise<Document | null> {
    const client = tx ?? db;
    const result = await client.query.documents.findFirst({
      where: eq(documents.id, id),
    });
    return result ?? null;
  }

  async findByOwnerId(ownerId: string, limit?: number, offset?: number, tx?: Tx): Promise<Document[]> {
    const client = tx ?? db;
    return client.query.documents.findMany({
      where: eq(documents.ownerId, ownerId),
      orderBy: [desc(documents.updatedAt)],
      limit,
      offset,
    });
  }

  async countByOwnerId(ownerId: string, tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client
      .select({ value: count() })
      .from(documents)
      .where(eq(documents.ownerId, ownerId));
    return result[0]?.value ?? 0;
  }

  async findByIds(ids: string[], tx?: Tx): Promise<Document[]> {
    if (ids.length === 0) return [];
    const client = tx ?? db;
    return client.query.documents.findMany({
      where: inArray(documents.id, ids),
    });
  }

  async findAll(tx?: Tx): Promise<Document[]> {
    const client = tx ?? db;
    return client.query.documents.findMany({
      orderBy: [desc(documents.updatedAt)],
      limit: 1000, // Safety limit — prevents OOM on large datasets
    });
  }

  async create(data: CreateDocumentData, tx?: Tx): Promise<Document> {
    const client = tx ?? db;
    const now = new Date();
    const [document] = await client
      .insert(documents)
      .values({
        id: data.id,
        title: data.title,
        content: data.content,
        ownerId: data.ownerId,
        version: '0',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return document;
  }

  async update(id: string, data: UpdateDocumentData, tx?: Tx): Promise<Document | null> {
    if (Object.keys(data).length === 0) {
      return this.findById(id, tx);
    }
    const client = tx ?? db;

    const [document] = await client
      .update(documents)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id))
      .returning();
    return document ?? null;
  }

  async delete(id: string, tx?: Tx): Promise<boolean> {
    const client = tx ?? db;
    const [deleted] = await client.delete(documents).where(eq(documents.id, id)).returning();
    return !!deleted;
  }

  async deleteByOwnerId(ownerId: string, tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client.delete(documents).where(eq(documents.ownerId, ownerId)).returning();
    return result.length;
  }

  async findByOwnerIdAndTitle(
    ownerId: string,
    title: string,
    excludeId?: string,
    tx?: Tx
  ): Promise<Document | null> {
    const client = tx ?? db;
    const conditions = [eq(documents.ownerId, ownerId), eq(documents.title, title)];
    if (excludeId) {
      conditions.push(ne(documents.id, excludeId));
    }
    const result = await client.query.documents.findFirst({
      where: and(...conditions),
    });
    return result ?? null;
  }

  async count(tx?: Tx): Promise<number> {
    const client = tx ?? db;
    const result = await client.select({ value: count() }).from(documents);
    return result[0]?.value ?? 0;
  }
}

export const documentRepository = new DocumentRepository();
