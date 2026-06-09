import type { Context, Next } from 'hono';

// CSRF protection via Origin/Referer header validation.
// Only protects state-changing methods (POST, PUT, PATCH, DELETE).
// GET/HEAD/OPTIONS are safe by convention and not checked.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalizeOrigin(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

export async function csrfMiddleware(c: Context, next: Next) {
  if (SAFE_METHODS.has(c.req.method)) {
    return next();
  }

  const corsOrigin = process.env.CORS_ORIGIN || '';

  // Reject state-changing requests when CORS_ORIGIN is not configured in production
  if (!corsOrigin) {
    if (process.env.NODE_ENV === 'production') {
      return c.json(
        { success: false, error: { code: 'CONFIG_ERROR', message: 'CORS_ORIGIN environment variable is not configured', requestId: c.get('requestId') } },
        500
      );
    }
    return next(); // Dev: skip check
  }

  const origin = c.req.header('Origin') || c.req.header('Referer') || '';

  // No Origin/Referer header sent.
  // In production, reject state-changing requests without an Origin header
  // to prevent certain CSRF variants (DNS rebinding, form-based attacks).
  // Modern browsers always send Origin on cross-origin requests; same-origin
  // API calls from our SPA also include the Origin header.
  if (!origin) {
    if (process.env.NODE_ENV === 'production') {
      return c.json(
        { success: false, error: { code: 'CSRF_INVALID', message: 'Missing Origin header', requestId: c.get('requestId') } },
        403
      );
    }
    return next(); // Dev: allow for tools like curl/Postman
  }

  const normalizedOrigin = normalizeOrigin(origin);
  // Support comma-separated origins (matching WS server behavior)
  const allowedOrigins = corsOrigin.split(',').map(s => normalizeOrigin(s.trim()));

  if (!allowedOrigins.includes(normalizedOrigin)) {
    return c.json(
      {
        success: false,
        error: { code: 'CSRF_INVALID', message: 'Invalid origin for state-changing request', requestId: c.get('requestId') },
      },
      403
    );
  }

  return next();
}
