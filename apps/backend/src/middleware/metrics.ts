import type { Context, Next } from 'hono';
import client from 'prom-client';

const register = new client.Registry();

client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

const collaborationSyncDuration = new client.Histogram({
  name: 'collaboration_sync_duration_seconds',
  help: 'Duration of collaboration document sync in seconds',
  labelNames: ['document_id'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 3, 5],
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(collaborationSyncDuration);

export { register };

export async function metricsMiddleware(c: Context, next: Next) {
  const start = Date.now();

  await next();

  const duration = (Date.now() - start) / 1000;
  const labels = {
    method: c.req.method,
    path: getPathTemplate(c.req.path),
    status: String(c.res.status),
  };

  httpRequestDuration.observe(labels, duration);
  httpRequestsTotal.inc(labels);
}

function getPathTemplate(path: string): string {
  return path
    .replace(/\/documents\/[^/]+/, '/documents/:id')
    .replace(/\/users\/[^/]+/, '/users/:id')
    .replace(/\/permissions\/[^/]+/, '/permissions/:id');
}

export { httpRequestDuration, collaborationSyncDuration };
