import type { Context, Next } from 'hono';

export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    const requestId = c.get('requestId');
    const user = c.get('user');

    // Detect body parse errors (invalid JSON, wrong Content-Type, etc.)
    // and return 400 instead of 500 so clients get actionable feedback.
    const msg = err instanceof Error ? err.message : '';
    const errName = err instanceof Error ? err.constructor.name : '';
    const isBodyParseError =
      errName === 'SyntaxError' || errName === 'TypeError' ||
      msg.includes('JSON') || msg.includes('Unexpected token') ||
      msg.includes('parse') || msg.includes('malformed') ||
      msg.includes('not valid JSON') || msg.includes('invalid') && msg.includes('body');

    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'error',
        errorType: err instanceof Error ? err.constructor.name : typeof err,
        message: msg || 'Unknown error',
        rawError: String(err),
        isBodyParseError,
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 3).join('\n') : undefined,
        requestId,
        userId: user?.id,
        path: c.req.path,
        method: c.req.method,
      })
    );

    if (isBodyParseError) {
      return c.json(
        {
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Invalid request body' },
        },
        400
      );
    }

    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An internal error occurred',
          details: process.env.NODE_ENV === 'development' ? msg || undefined : undefined,
        },
      },
      500
    );
  }
}
