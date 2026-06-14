import type { Context, Next } from 'hono';
import { redis } from '../db/redis.js';
import { logger } from '../lib/logger.js';

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

// Track consecutive Redis failures to avoid log flooding while still
// alerting when the rate limiter has been degraded for an extended period.
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_ALERT = 5;

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

      // Reset consecutive failure counter on success
      consecutiveFailures = 0;

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
      // If Redis fails, allow the request (fail-open for availability)
      // but track consecutive failures for alerting
      consecutiveFailures++;
      if (consecutiveFailures === MAX_FAILURES_BEFORE_ALERT) {
        logger.error(
          `Rate limiter: Redis failures reached threshold (${consecutiveFailures})`,
          err instanceof Error ? err : undefined,
          { service: 'rate-limiter', consecutiveFailures }
        );
      } else if (consecutiveFailures > MAX_FAILURES_BEFORE_ALERT && consecutiveFailures % 50 === 0) {
        logger.warn(`Rate limiter: still degraded (${consecutiveFailures} consecutive failures)`, {
          service: 'rate-limiter',
          consecutiveFailures,
        });
      }
      await next();
    }
  };
}

export const searchRateLimit = rateLimitMiddleware(searchRateLimitConfig);
