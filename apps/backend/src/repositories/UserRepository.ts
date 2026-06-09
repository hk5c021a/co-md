import { eq, or, ilike, and, not, inArray } from 'drizzle-orm';
import { db, type Tx } from '../db/index.js';
import { users, type User } from '../db/schema.js';

export interface CreateUserData {
  id: string;
  username: string;
  email: string;
  phone: string;
  passwordHash: string;
  pbkdf2Salt: string;
}

export interface UpdateUserData {
  username?: string;
  email?: string;
  phone?: string;
  passwordHash?: string;
}

export class UserRepository {
  async findById(id: string, tx?: Tx): Promise<User | null> {
    const client = tx ?? db;
    const result = await client.query.users.findFirst({
      where: eq(users.id, id),
    });
    return result ?? null;
  }

  async findByIds(ids: string[], tx?: Tx): Promise<User[]> {
    if (ids.length === 0) return [];
    const client = tx ?? db;
    const result = await client.query.users.findMany({
      where: inArray(users.id, ids),
    });
    return result;
  }

  async findByUsername(username: string, tx?: Tx): Promise<User | null> {
    const client = tx ?? db;
    const result = await client.query.users.findFirst({
      where: eq(users.username, username),
    });
    return result ?? null;
  }

  async findByEmail(email: string, tx?: Tx): Promise<User | null> {
    const client = tx ?? db;
    const result = await client.query.users.findFirst({
      where: eq(users.email, email),
    });
    return result ?? null;
  }

  async findByPhone(phone: string, tx?: Tx): Promise<User | null> {
    const client = tx ?? db;
    const result = await client.query.users.findFirst({
      where: eq(users.phone, phone),
    });
    return result ?? null;
  }

  async findByIdentifier(identifier: string, tx?: Tx): Promise<User | null> {
    const client = tx ?? db;
    // Single OR query instead of three sequential username/email/phone lookups
    const result = await client.query.users.findFirst({
      where: or(
        eq(users.username, identifier),
        eq(users.email, identifier),
        eq(users.phone, identifier)
      ),
    });
    return result ?? null;
  }

  async searchByFuzzy(query: string, excludeUserId: string, limit = 20, tx?: Tx): Promise<User[]> {
    const client = tx ?? db;
    // Escape PostgreSQL LIKE wildcards to prevent pattern-injection
    const escaped = query.replace(/[%_]/g, '\\$&');
    const pattern = `%${escaped}%`;
    const results = await client
      .select()
      .from(users)
      .where(
        and(
          not(eq(users.id, excludeUserId)),
          or(
            ilike(users.username, pattern),
            ilike(users.email, pattern),
            ilike(users.phone, pattern)
          )
        )
      )
      .limit(limit);
    return results;
  }

  async create(data: CreateUserData, tx?: Tx): Promise<User> {
    const client = tx ?? db;
    const now = new Date();
    const [user] = await client
      .insert(users)
      .values({
        id: data.id,
        username: data.username,
        email: data.email,
        phone: data.phone,
        passwordHash: data.passwordHash,
        pbkdf2Salt: data.pbkdf2Salt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return user;
  }

  async update(id: string, data: UpdateUserData, tx?: Tx): Promise<User | null> {
    if (Object.keys(data).length === 0) {
      return this.findById(id, tx);
    }
    const client = tx ?? db;

    const [user] = await client
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user ?? null;
  }

  async delete(id: string, tx?: Tx): Promise<boolean> {
    const client = tx ?? db;
    const [deleted] = await client.delete(users).where(eq(users.id, id)).returning();
    return !!deleted;
  }

  async existsByUsername(username: string, tx?: Tx): Promise<boolean> {
    const user = await this.findByUsername(username, tx);
    return !!user;
  }

  async existsByEmail(email: string, tx?: Tx): Promise<boolean> {
    const user = await this.findByEmail(email, tx);
    return !!user;
  }

  async existsByPhone(phone: string, tx?: Tx): Promise<boolean> {
    const user = await this.findByPhone(phone, tx);
    return !!user;
  }
}

export const userRepository = new UserRepository();
