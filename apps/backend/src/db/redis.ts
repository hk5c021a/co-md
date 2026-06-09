import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = createClient({ url: redisUrl });

redis.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

export async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

// ── Token storage (refresh token management) ──
const RT_PREFIX = 'rt:';
const RT_OLD_PREFIX = 'rt_old:';
const RT_RESULT_PREFIX = 'rt_result:';
const RT_TTL = 7 * 24 * 60 * 60; // 7 days

interface RefreshTokenData {
  familyId: string;
  revoked: boolean;
}

export async function setRefreshToken(userId: string, sessionId: string, familyId: string, revoked: boolean): Promise<void> {
  const key = `${RT_PREFIX}${userId}:${sessionId}`;
  await redis.set(key, JSON.stringify({ familyId, revoked }), { EX: RT_TTL });
}

export async function getRefreshToken(userId: string, sessionId: string): Promise<RefreshTokenData | null> {
  const key = `${RT_PREFIX}${userId}:${sessionId}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as RefreshTokenData;
}

export async function delRefreshToken(userId: string, sessionId: string): Promise<void> {
  const key = `${RT_PREFIX}${userId}:${sessionId}`;
  await redis.del(key);
}

export async function setOldFamily(userId: string, sessionId: string, familyId: string): Promise<void> {
  const key = `${RT_OLD_PREFIX}${userId}:${sessionId}`;
  await redis.set(key, familyId, { EX: 30 }); // 30s concurrency window
}

export async function getOldFamily(userId: string, sessionId: string): Promise<string | null> {
  const key = `${RT_OLD_PREFIX}${userId}:${sessionId}`;
  return redis.get(key);
}

export async function setRefreshResult(oldHash: string, result: string): Promise<void> {
  const key = `${RT_RESULT_PREFIX}${oldHash}`;
  await redis.set(key, result, { EX: 30 });
}

export async function getRefreshResult(oldHash: string): Promise<string | null> {
  const key = `${RT_RESULT_PREFIX}${oldHash}`;
  return redis.get(key);
}

// ── Token blacklist (session revocation) ──
const BLACKLIST_TTL = 15 * 60; // 15 min (matches access token TTL)

export async function blacklistSession(sessionId: string): Promise<void> {
  await redis.set(`token_blacklist:${sessionId}`, '1', { EX: BLACKLIST_TTL });
}

// ── User token cleanup ──
export async function delTokensByUserId(userId: string): Promise<void> {
  // Scan for all refresh token keys for this user and delete them
  let cursor = 0;
  do {
    const { cursor: nextCursor, keys } = await redis.scan(cursor, {
      MATCH: `${RT_PREFIX}${userId}:*`,
      COUNT: 100,
    });
    cursor = nextCursor;
    if (keys.length > 0) await redis.del(keys);
  } while (cursor !== 0);
}
