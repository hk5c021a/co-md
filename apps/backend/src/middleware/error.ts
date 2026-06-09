import type { Context, Next } from 'hono';

export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    const requestId = c.get('requestId');
    const user = c.get('user');

    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'error',
        errorType: err instanceof Error ? err.constructor.name : 'Unknown',
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
        requestId,
        userId: user?.id,
        path: c.req.path,
        method: c.req.method,
      })
    );

    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An internal error occurred',
          details: process.env.NODE_ENV === 'development' ? err instanceof Error ? err.message : undefined : undefined,
        },
      },
      500
    );
  }
}
