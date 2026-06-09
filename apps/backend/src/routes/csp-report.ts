import { Hono } from 'hono';
import type { Context } from 'hono';
import { logger } from '../lib/logger.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';

const app = new Hono();

// Rate-limit CSP reports to prevent log flooding
app.use('/*', rateLimitMiddleware({ maxRequests: 30, windowSeconds: 60 }));

app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json();
    // CSP Level 2 format: { "csp-report": {...} }
    // CSP Level 3 (Reporting API) format: [{ type: "csp-violation", body: {...} }]
    const reports = Array.isArray(body) ? body : [body];
    for (const entry of reports) {
      const report =
        entry?.['csp-report'] || (entry?.type === 'csp-violation' ? entry?.body : null);
      if (report) {
        // Sanitize URLs to avoid logging PII in query parameters/path segments
        const sanitized = { ...report };
        if (sanitized['document-uri']) {
          try {
            const u = new URL(sanitized['document-uri']);
            sanitized['document-uri'] = u.origin + u.pathname;
          } catch { /* not a valid URL, log as-is */ }
        }
        if (sanitized.referrer) {
          try {
            const u = new URL(sanitized.referrer);
            sanitized.referrer = u.origin + u.pathname;
          } catch { /* not a valid URL, log as-is */ }
        }
        logger.warn('CSP Violation', { report: JSON.stringify(sanitized) });
      }
    }
  } catch {
    // Report body may not be JSON — silently ignore
  }
  return c.body(null, 204);
});

export default app;
