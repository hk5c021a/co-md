import type { Context, Next } from 'hono';

const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB
const UPLOAD_PATH = '/api/upload';

/**
 * Global request body size limit middleware.
 * Rejects requests whose Content-Length exceeds the configured maximum.
 * The /api/upload route has its own more granular limits and is excluded.
 */
export function bodyLimitMiddleware(maxSize = DEFAULT_MAX_BODY_SIZE) {
  return async (c: Context, next: Next) => {
    // Skip upload route — it has its own file-specific size validation
    if (c.req.path === UPLOAD_PATH) {
      return next();
    }

    const contentLength = c.req.header('Content-Length');
    if (contentLength) {
      const len = parseInt(contentLength, 10);
      if (!isNaN(len) && len > maxSize) {
        return c.json(
          {
            success: false,
            error: {
              code: 'PAYLOAD_TOO_LARGE',
              message: `Request body too large (max ${Math.round(maxSize / 1024 / 1024)}MB)`,
            },
          },
          413
        );
      }
    }

    return next();
  };
}
