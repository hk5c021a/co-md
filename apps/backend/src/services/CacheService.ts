import { redis } from '../db/redis.js';
import { logger } from '../lib/logger.js';

const DEFAULT_TTL = 5 * 60; // 5 minutes default

export interface CacheOptions {
  ttl?: number;
  prefix: string;
}

export class CacheService {
  private prefix: string;
  private defaultTtl: number;

  constructor(options: CacheOptions) {
    this.prefix = options.prefix;
    this.defaultTtl = options.ttl ?? DEFAULT_TTL;
  }

  private buildKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(this.buildKey(key));
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      logger.error(`Cache get error [${this.prefix}]:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await redis.set(this.buildKey(key), serialized, {
        EX: ttl ?? this.defaultTtl,
      });
    } catch (error) {
      logger.error(`Cache set error [${this.prefix}]:`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await redis.del(this.buildKey(key));
    } catch (error) {
      logger.error(`Cache delete error [${this.prefix}]:`, error);
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      const fullPattern = this.buildKey(pattern);
      const keys: string[] = [];
      let cursor = 0;
      let iterations = 0;
      const MAX_ITERATIONS = 1000; // Safety bound: ~100K keys at COUNT=100
      do {
        const result = await redis.scan(cursor, { MATCH: fullPattern, COUNT: 100 });
        cursor = result.cursor;
        keys.push(...result.keys);
        if (++iterations > MAX_ITERATIONS) {
          logger.warn(`Cache deletePattern [${this.prefix}]: scan limit reached`, { iterations });
          break;
        }
      } while (cursor !== 0);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    } catch (error) {
      logger.error(`Cache deletePattern error [${this.prefix}]:`, error);
    }
  }

  async clear(): Promise<void> {
    await this.deletePattern('*');
  }
}

// Pre-configured cache instances
export const userCache = new CacheService({ prefix: 'user', ttl: 10 * 60 }); // 10 minutes
export const permissionCache = new CacheService({ prefix: 'permission', ttl: 60 }); // 1 minute
export const documentCache = new CacheService({ prefix: 'document', ttl: 5 * 60 }); // 5 minutes
export const contactCache = new CacheService({ prefix: 'contact', ttl: 5 * 60 }); // 5 minutes
export const notificationCache = new CacheService({ prefix: 'notification', ttl: 2 * 60 }); // 2 minutes
