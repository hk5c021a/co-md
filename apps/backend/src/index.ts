import { serve } from '@hono/node-server';
import { createSecureServer } from 'node:http2';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'node:fs';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context } from 'hono';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cspMiddleware } from './middleware/csp.js';
import { loggerMiddleware } from './middleware/logger.js';
import { errorMiddleware } from './middleware/error.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { bodyLimitMiddleware } from './middleware/bodyLimit.js';
import authRoute from './routes/auth.js';
import documentsRoute from './routes/documents.js';
import permissionsRoute from './routes/permissions.js';
import notificationsRoute from './routes/notifications.js';
import contactsRoute from './routes/contacts.js';
import usersRoute from './routes/users.js';
import uploadRoute from './routes/upload.js';
import filesRoute from './routes/files.js';
import internalRoute from './routes/internal.js';
import cspReportRoute from './routes/csp-report.js';
import { connectRedis, redis } from './db/redis.js';
import { checkConnection } from './db/index.js';
import { logger } from './lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function serveIndexWithNonce(c: Context) {
  const filePath = resolve(__dirname, '../frontend/dist', 'index.html');
  let html = await readFile(filePath, 'utf-8');
  const nonce = c.get('cspNonce') || '';
  html = html.replace(/__CSP_NONCE__/g, nonce);
  html = html.replace(
    /(<script\b(?![^>]*\bnonce\s*=)[^>]*)>/gi,
    `$1 nonce="${nonce}">`
  );
  return c.html(html);
}

const app = new Hono();

app.use('*', cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use('*', loggerMiddleware);
app.use('*', errorMiddleware);
app.use('*', bodyLimitMiddleware());
app.use('*', cspMiddleware);
app.use('*', csrfMiddleware);

// Rate limit auth state-changing endpoints (login, register, password-reset).
// Excludes read-only endpoints (captcha, salt) which are called frequently.
const authLimit = rateLimitMiddleware({ maxRequests: 30, windowSeconds: 60 });
app.use('/api/auth/register', authLimit);
app.use('/api/auth/login', authLimit);
app.use('/api/auth/refresh', authLimit);
app.use('/api/auth/logout', authLimit);
app.use('/api/auth/password-reset/*', authLimit);

// Routes
app.route('/api/csp-report', cspReportRoute);
app.route('/api/auth', authRoute);
app.route('/api/documents', documentsRoute);
app.route('/api/permissions', permissionsRoute);
app.route('/api/notifications', notificationsRoute);
app.route('/api/contacts', contactsRoute);
app.route('/api/users', usersRoute);
app.route('/api/upload', uploadRoute);
app.route('/api/files', filesRoute);
app.route('/api/internal', internalRoute);

app.get('/health', async (c) => {
  const dbOk = await checkConnection().catch(() => false);
  const redisOk = await redis.ping().then(() => true).catch(() => false);
  return c.json({
    success: dbOk && redisOk,
    status: dbOk && redisOk ? 'ok' : 'degraded',
    checks: { db: dbOk ? 'ok' : 'fail', redis: redisOk ? 'ok' : 'fail' },
  }, dbOk && redisOk ? 200 : 503);
});

const isDev = process.env.VITE_DEV === 'true';
const frontendDist = resolve(__dirname, '../frontend/dist');

if (!isDev) {
  logger.info('PROD mode: serving static from dist');
  app.get('/', async (c: Context) => {
    c.header('Cache-Control', 'no-cache, must-revalidate');
    return serveIndexWithNonce(c);
  });
  app.use('*', serveStatic({ root: frontendDist }));
  app.notFound(async (c) => {
    const path = c.req.path;
    if (c.req.method === 'GET' && !path.startsWith('/api/')) {
      const isAsset = /\.[a-z0-9]{2,6}$/i.test(path);
      if (!isAsset) {
        c.header('Cache-Control', 'no-cache, must-revalidate');
        return serveIndexWithNonce(c);
      }
    }
    // API path — return consistent JSON error
    if (path.startsWith('/api/')) {
      c.status(404);
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
      });
    }
    // Missing static asset — return 404 with the correctly-typed body
    // so browsers don't log misleading MIME-type warnings
    const extMimes: Record<string, string> = {
      '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
      '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
      '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
      '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
      '.json': 'application/json', '.html': 'text/html', '.txt': 'text/plain',
    };
    const ext = path.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() || '';
    c.status(404);
    c.header('Content-Type', extMimes[ext] || 'text/plain');
    return c.body('');
  });
} else {
  logger.info('DEV mode: proxy to Vite');
  app.get('/', (c: Context) => c.json({ message: 'Collab Backend API — Dev Mode' }));
}

const port = Number(process.env.PORT) || 3000;

// HTTPS/HTTP2 config — uses mkcert certs if available
function getTlsOptions() {
  const certDir = resolve(__dirname, '../../../certs');
  const keyPath = resolve(certDir, 'key.pem');
  const certPath = resolve(certDir, 'cert.pem');
  if (existsSync(keyPath) && existsSync(certPath)) {
    return { key: readFileSync(keyPath), cert: readFileSync(certPath), allowHTTP1: true };
  }
  return null;
}

// ── Global error handlers ──
// Uncaught exceptions leave the process in an undefined state — log and exit.
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});

// Unhandled promise rejections — log but don't crash (Node warns by default).
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

async function start() {
  await connectRedis();
  logger.info('Redis connected');

  const tls = getTlsOptions();
  if (tls) {
    serve({
      fetch: app.fetch,
      port,
      createServer: createSecureServer,
      serverOptions: tls,
    }, () => {
      logger.info(`Server running on https://localhost:${port} (HTTP/2)`);
    });
  } else {
    serve({ fetch: app.fetch, port }, () => {
      logger.info(`Server running on http://localhost:${port} (HTTP/1.1)`);
    });
  }
}

start();
