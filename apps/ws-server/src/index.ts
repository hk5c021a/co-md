import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from 'redis';
import * as jose from 'jose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import * as Y from 'yjs';
import { Doc } from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { randomUUID } from 'node:crypto';

const WS_PORT = Number(process.env.WS_PORT) || 4000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || 'dev-secret';
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-for-dev');
// Must match packages/shared/src/entities/index.ts
const NOTIFICATION_CHANNEL_PREFIX = 'user:';
const NOTIFICATION_CHANNEL_SUFFIX = ':notifications';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const redis = createClient({ url: REDIS_URL });
redis.on('error', () => {});
redis.connect().catch(() => {});

const MAX_CONNECTIONS_PER_IP = 20;
const MAX_MESSAGES_PER_SEC = 30;
const ipConnections = new Map<string, number>();
const messageCounters = new Map<WebSocket, { count: number; resetAt: number }>();

const docs = new Map<string, { doc: Doc; awareness: awarenessProtocol.Awareness; clients: Set<WebSocket> }>();

// ── Notification subscribers ──
// Key: userId, Value: { clients: Set<WebSocket>, subscriber: RedisClient (pub/sub) }
interface NotificationEntry {
  clients: Set<WebSocket>;
  subscriber: ReturnType<typeof redis.duplicate> | null;
}
const notificationEntries = new Map<string, NotificationEntry>();

async function verifyJwt(token: string): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    if (payload.type !== 'access') return null;
    return { sub: payload.sub as string };
  } catch {
    return null;
  }
}

async function subscribeNotifications(userId: string, ws: WebSocket): Promise<void> {
  let entry = notificationEntries.get(userId);
  if (!entry) {
    entry = { clients: new Set(), subscriber: null };
    notificationEntries.set(userId, entry);
  }
  entry.clients.add(ws);

  // First connection for this user → create Redis subscriber
  if (!entry.subscriber) {
    const channel = `${NOTIFICATION_CHANNEL_PREFIX}${userId}${NOTIFICATION_CHANNEL_SUFFIX}`;
    const sub = redis.duplicate();
    await sub.connect();
    await sub.subscribe(channel, (message: string) => {
      const e = notificationEntries.get(userId);
      if (!e || !e.subscriber) { sub.unsubscribe(channel).catch(() => {}); sub.quit().catch(() => {}); return; }
      e.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
        else e!.clients.delete(client);
      });
    });
    entry.subscriber = sub;
  }
}

async function unsubscribeNotifications(userId: string, ws: WebSocket): Promise<void> {
  const entry = notificationEntries.get(userId);
  if (!entry) return;
  entry.clients.delete(ws);
  if (entry.clients.size === 0) {
    notificationEntries.delete(userId);
    if (entry.subscriber) {
      const channel = `${NOTIFICATION_CHANNEL_PREFIX}${userId}${NOTIFICATION_CHANNEL_SUFFIX}`;
      await entry.subscriber.unsubscribe(channel).catch(() => {});
      await entry.subscriber.quit().catch(() => {});
    }
  }
}

function getOrCreateDoc(docId: string) {
  let entry = docs.get(docId);
  if (!entry) {
    const doc = new Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    const clients = new Set<WebSocket>();
    entry = { doc, awareness, clients };

    doc.on('update', (update: Uint8Array, origin: any) => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.writeUpdate(enc, update);
      const msg = encoding.toUint8Array(enc);
      clients.forEach((client) => {
        if (client !== origin && client.readyState === WebSocket.OPEN) client.send(msg);
      });
    });

    awareness.on('update', ({ added, updated, removed }: any, origin: any) => {
      const changed = added.concat(updated, removed);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
      const msg = encoding.toUint8Array(enc);
      clients.forEach((client) => {
        if (client !== origin && client.readyState === WebSocket.OPEN) client.send(msg);
      });
    });

    docs.set(docId, entry);
  }
  return entry;
}

// ── TLS config (reuses mkcert certs) ──
function getTlsOptions() {
  const keyPath = resolve(__dirname, '../../../certs/key.pem');
  const certPath = resolve(__dirname, '../../../certs/cert.pem');
  if (existsSync(keyPath) && existsSync(certPath)) {
    return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  }
  return null;
}

const tls = getTlsOptions();
const server = tls
  ? createServer(tls, (req, res) => {
      // Health check
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), checks: { redis: redis.isOpen ? 'ok' : 'fail' } }));
        return;
      }
      res.writeHead(404);
      res.end();
    })
  : null;

const wss = new WebSocketServer(tls ? { server } : { port: WS_PORT });

wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;

  // ── Notification Socket ──
  if (path === '/notifications') {
    const ip = req.socket.remoteAddress || 'unknown';
    const ipCount = (ipConnections.get(ip) || 0) + 1;
    if (ipCount > MAX_CONNECTIONS_PER_IP) { ws.close(4000, 'Too many connections'); return; }
    ipConnections.set(ip, ipCount);

    // ── IMPORTANT: Register close handler BEFORE any async operations.
    // If JWT verification or Redis subscription fails, the IP counter must
    // still be decremented — otherwise every failed connection leaks a slot
    // and eventually ALL notification connections are blocked (4000).
    let userId: string | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    ws.on('close', () => {
      if (userId) { unsubscribeNotifications(userId, ws).catch(() => {}); }
      const c = (ipConnections.get(ip) || 1) - 1;
      if (c <= 0) ipConnections.delete(ip); else ipConnections.set(ip, c);
      if (timeout) clearTimeout(timeout);
    });

    // Extract JWT from Sec-WebSocket-Protocol header (format: "token.<jwt>")
    const protocols = req.headers['sec-websocket-protocol'] || '';
    const token = protocols.startsWith('token.') ? protocols.slice('token.'.length) : null;
    if (!token) { ws.close(4001, 'Missing token'); return; }

    const resetTimer = () => {
      if (timeout) clearTimeout(timeout);
      // Close idle connections after 2 minutes of inactivity
      timeout = setTimeout(() => { ws.close(4001, 'Token expired'); }, 120_000);
    };

    (async () => {
      const payload = await verifyJwt(token);
      if (!payload) { ws.close(4001, 'Invalid token'); return; }
      userId = payload.sub;
      await subscribeNotifications(userId, ws);
      resetTimer();

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            resetTimer();
          } else if (msg.type === 'token-refreshed' && msg.accessToken) {
            (async () => {
              const newPayload = await verifyJwt(msg.accessToken);
              if (newPayload && newPayload.sub === userId) {
                resetTimer();
              }
            })().catch(() => {});
          }
        } catch { /* ignore malformed messages */ }
      });
    })().catch(() => { ws.close(4001, 'Auth failed'); });

    return;
  }

  // ── Document Collaboration Socket ──
  const docId = path.split('/').pop() || 'default';

  const ip = req.socket.remoteAddress || 'unknown';
  const ipCount = (ipConnections.get(ip) || 0) + 1;
  if (ipCount > MAX_CONNECTIONS_PER_IP) { ws.close(4000, 'Too many connections'); return; }
  ipConnections.set(ip, ipCount);
  messageCounters.set(ws, { count: 0, resetAt: Date.now() + 1000 });

  const { doc, awareness, clients } = getOrCreateDoc(docId);
  clients.add(ws);

  // Send initial sync step 1 (full document state) — one-shot encoder
  const initEnc = encoding.createEncoder();
  encoding.writeVarUint(initEnc, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(initEnc, doc);
  ws.send(encoding.toUint8Array(initEnc));

  // Send initial awareness (client ID assignment)
  const awEnc = encoding.createEncoder();
  encoding.writeVarUint(awEnc, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(awEnc, awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID]));
  ws.send(encoding.toUint8Array(awEnc));

  ws.on('message', (data: Buffer) => {
    const counter = messageCounters.get(ws);
    if (counter) {
      if (Date.now() > counter.resetAt) { counter.count = 0; counter.resetAt = Date.now() + 1000; }
      if (++counter.count > MAX_MESSAGES_PER_SEC) return;
    }
    try {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      const msgType = decoding.readVarUint(decoder);
      if (msgType === MESSAGE_SYNC) {
        // Each message must use a FRESH encoder — reusing the initial sync-step-1
        // encoder (or any previous response encoder) pollutes the next response
        // with stale data, causing the client to receive full-document snapshots
        // on every keystroke instead of incremental updates.
        const respEnc = encoding.createEncoder();
        encoding.writeVarUint(respEnc, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, respEnc, doc, ws);
        if (encoding.length(respEnc) > 1) ws.send(encoding.toUint8Array(respEnc));
      } else if (msgType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), ws);
      }
    } catch (err) { console.error('[WS] msg error:', err); }
  });

  ws.on('close', () => {
    clients.delete(ws);
    const c = (ipConnections.get(ip) || 1) - 1;
    if (c <= 0) ipConnections.delete(ip); else ipConnections.set(ip, c);
    messageCounters.delete(ws);
    if (clients.size === 0) {
      const update = Y.encodeStateAsUpdate(doc);
      fetch(`${BACKEND_URL}/api/internal/documents/${docId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${INTERNAL_SECRET}` },
        body: JSON.stringify({ content: { yjsUpdate: Buffer.from(update).toString('base64') } }),
      }).catch(() => {});
    }
  });
});

if (tls) {
  server!.listen(WS_PORT, () => console.log(`[WS] Collaborative server running on wss://localhost:${WS_PORT}`));
} else {
  console.log(`[WS] Collaborative server running on ws://localhost:${WS_PORT}`);
}
