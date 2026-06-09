import type { Context, Next } from 'hono';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';

const tracer = trace.getTracer('collab-backend');

export async function tracingMiddleware(c: Context, next: Next) {
  const requestId = c.req.header('X-Request-ID') || randomUUID();
  const traceId = c.req.header('X-Trace-ID') || randomUUID();

  c.set('requestId', requestId);
  c.set('traceId', traceId);

  const span = tracer.startSpan(`${c.req.method} ${c.req.path}`, {
    attributes: {
      'http.method': c.req.method,
      'http.url': c.req.url,
      'http.target': c.req.path,
      'http.request_id': requestId,
      'http.trace_id': traceId,
    },
  });

  const ctx = trace.setSpan(context.active(), span);

  try {
    await context.with(ctx, async () => {
      await next();
    });

    span.setStatus({
      code: c.res.status >= 400 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
    });
  } catch (err) {
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : 'Unknown error',
    });
    throw err;
  } finally {
    span.end();
  }
}

export function createSpan(name: string, fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<void>) {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
