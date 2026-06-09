import { trace } from '@opentelemetry/api';
import { logger } from './logger.js';

/**
 * Emit an audit event as an OpenTelemetry Span Event.
 * Attached to the current active span — automatically correlated with the request trace.
 *
 * Prerequisites: tracingMiddleware must run before the route handler.
 * When no active span exists (e.g. background tasks, OTEL not configured), falls back
 * to structured JSON log via the application logger.
 */
export function auditLog(
  action: string,
  attrs: Record<string, string | number | undefined> = {}
): void {
  // Filter out undefined values
  const clean: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) clean[k] = v;
  }

  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(`audit.${action}`, clean);
    // Tag span so it's filterable in tracing UIs
    span.setAttribute('audit.action', action);
  } else {
    // Fallback: emit via structured logger (respects LOG_LEVEL filtering)
    logger.info(`audit.${action}`, clean);
  }
}
