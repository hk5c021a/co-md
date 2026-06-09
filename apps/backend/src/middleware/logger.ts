import type { Context, Next } from 'hono';
import { randomUUID } from 'node:crypto';

interface LogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  status?: number;
  duration?: number;
  userId?: string;
  action?: string;
  error?: string;
}

export async function loggerMiddleware(c: Context, next: Next) {
  const requestId = c.req.header('X-Request-ID') || randomUUID();
  const start = Date.now();

  c.set('requestId', requestId);

  try {
    await next();

    const duration = Date.now() - start;
    const user = c.get('user');

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
      userId: user?.id,
    };

    if (c.res.status >= 400) {
      logEntry.error = `HTTP ${c.res.status}`;
    }

    console.log(JSON.stringify(logEntry));
  } catch (err) {
    const duration = Date.now() - start;
    const user = c.get('user');

    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        method: c.req.method,
        path: c.req.path,
        duration,
        userId: user?.id,
        error: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
      })
    );

    throw err;
  }
}
