import type { Context, Next } from 'hono';
import { redis } from '../db/redis.js';

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

const defaultConfig: RateLimitConfig = {
  maxRequests: 10, // 10 requests
  windowSeconds: 60, // per minute
};

const searchRateLimitConfig: RateLimitConfig = {
  maxRequests: 10,
  windowSeconds: 60,
};

export function rateLimitMiddleware(config: RateLimitConfig = defaultConfig) {
  return async (c: Context, next: Next) => {
    const userId = c.get('user')?.id || c.req.header('X-Forwarded-For') || 'anonymous';
    const key = `ratelimit:${userId}:${c.req.path}`;

    try {
      const current = await redis.incr(key);

      if (current === 1) {
        await redis.expire(key, config.windowSeconds);
      }

      const ttl = await redis.ttl(key);

      c.header('X-RateLimit-Limit', String(config.maxRequests));
      c.header('X-RateLimit-Remaining', String(Math.max(0, config.maxRequests - current)));
      c.header('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + ttl));

      if (current > config.maxRequests) {
        return c.json(
          {
            success: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many requests, please try again later',
            },
          },
          429
        );
      }

      await next();
    } catch (err) {
      // If Redis fails, allow the request but log the error
      console.error('Rate limit check failed:', err);
      await next();
    }
  };
}

export const searchRateLimit = rateLimitMiddleware(searchRateLimitConfig);
