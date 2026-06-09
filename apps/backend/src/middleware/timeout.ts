import type { Context, Next } from 'hono';

/**
 * Request-level timeout middleware.
 * Aborts hanging requests after `ms` milliseconds.
 * Default 30s; use longer timeout for upload routes.
 */
export function timeoutMiddleware(ms = 30_000) {
  return async (c: Context, next: Next) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    c.set('requestSignal', controller.signal);

    try {
      await next();
    } finally {
      clearTimeout(timer);
    }
  };
}
