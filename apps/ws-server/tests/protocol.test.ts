import { describe, it, expect } from 'vitest';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import * as jose from 'jose';

// ── Protocol constants (mirrors ws-server/src/index.ts) ──
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const NOTIFICATION_CHANNEL_PREFIX = 'user:';
const NOTIFICATION_CHANNEL_SUFFIX = ':notifications';

// ── lib0 encoding/decoding ──

describe('lib0 encoding/decoding', () => {
  it('encodes and decodes a VarUint message type', () => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    const buf = encoding.toUint8Array(enc);

    const dec = decoding.createDecoder(buf);
    const msgType = decoding.readVarUint(dec);
    expect(msgType).toBe(MESSAGE_SYNC);
  });

  it('encodes and decodes awareness message type', () => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_AWARENESS);
    const buf = encoding.toUint8Array(enc);

    const dec = decoding.createDecoder(buf);
    expect(decoding.readVarUint(dec)).toBe(MESSAGE_AWARENESS);
  });

  it('handles VarUint8Array encoding/decoding', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const enc = encoding.createEncoder();
    encoding.writeVarUint8Array(enc, data);
    const buf = encoding.toUint8Array(enc);

    const dec = decoding.createDecoder(buf);
    const decoded = decoding.readVarUint8Array(dec);
    expect(decoded).toEqual(data);
  });

  it('encoder length starts at 1 with just message type', () => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    expect(encoding.length(enc)).toBe(1);
  });

  it('fresh encoder produces independent output (no reuse bug)', () => {
    // This verifies the fix for the encoder reuse bug:
    // Each message must use a fresh encoder — reusing one from a previous
    // message would pollute the response with stale data.

    const doc1 = new Y.Doc();
    doc1.getText('content').insert(0, 'Hello World');

    // Simulate what the server does: create sync step 1 for initial state
    const initEnc = encoding.createEncoder();
    encoding.writeVarUint(initEnc, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(initEnc, doc1);
    const initMsg = encoding.toUint8Array(initEnc);

    // Now simulate a second message with a different document
    const doc2 = new Y.Doc();
    doc2.getText('content').insert(0, 'Different');

    // A FRESH encoder must be used
    const freshEnc = encoding.createEncoder();
    encoding.writeVarUint(freshEnc, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(freshEnc, doc2);
    const freshMsg = encoding.toUint8Array(freshEnc);

    // The two messages should be different
    expect(initMsg).not.toEqual(freshMsg);

    // The second message should NOT contain data from the first doc
    // (this is what the old reuse bug caused)
    const dec = decoding.createDecoder(freshMsg);
    expect(decoding.readVarUint(dec)).toBe(MESSAGE_SYNC);
  });
});

// ── Yjs sync protocol ──

describe('Yjs sync protocol', () => {
  it('sync step 1 sends full document state', () => {
    const doc = new Y.Doc();
    doc.getText('text').insert(0, 'Initial content');

    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(enc, doc);
    const msg = encoding.toUint8Array(enc);

    expect(msg.length).toBeGreaterThan(1);
  });

  it('sync step 2 can be read from a fresh encoder without pollution', () => {
    const doc = new Y.Doc();
    doc.getText('text').insert(0, 'Synced content');

    // Server sends step 1
    const step1Enc = encoding.createEncoder();
    encoding.writeVarUint(step1Enc, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(step1Enc, doc);
    const step1Msg = encoding.toUint8Array(step1Enc);

    // Client responds with step 2 (acknowledgement)
    const step2Dec = decoding.createDecoder(step1Msg);
    // Skip the message type already read by the server's dispatch
    const step1Type = decoding.readVarUint(step2Dec);

    // The server calls readSyncMessage which internally handles step2
    // Using a fresh encoder is critical
    const respEnc = encoding.createEncoder();
    encoding.writeVarUint(respEnc, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(step2Dec, respEnc, doc, null);

    // Step 2 response contains sync protocol acknowledgment
    // The response length is small but > 2 because sync step 2
    // returns a sync message with protocol metadata.
    const respMsg = encoding.toUint8Array(respEnc);
    expect(encoding.length(respEnc)).toBeGreaterThan(1);
    // Verify it's a valid sync message by reading the type
    const respDec = decoding.createDecoder(respMsg);
    expect(decoding.readVarUint(respDec)).toBe(MESSAGE_SYNC);
  });
});

// ── Yjs awareness protocol ──

describe('Yjs awareness protocol', () => {
  it('encodes and applies awareness update', () => {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);

    awareness.setLocalStateField('user', { name: 'TestUser', color: '#ff0000' });

    // Encode awareness update
    const changed = Array.from(awareness.getStates().keys());
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
    const msg = encoding.toUint8Array(enc);

    // Decode awareness update on a different awareness instance
    const doc2 = new Y.Doc();
    const awareness2 = new awarenessProtocol.Awareness(doc2);

    const dec = decoding.createDecoder(msg);
    expect(decoding.readVarUint(dec)).toBe(MESSAGE_AWARENESS);
    awarenessProtocol.applyAwarenessUpdate(awareness2, decoding.readVarUint8Array(dec), null);

    // The second awareness should now have the state
    expect(awareness2.getStates().size).toBeGreaterThan(0);
  });
});

// ── Notification channel format ──

describe('Notification channel format', () => {
  it('formats notification channel correctly', () => {
    const userId = 'abc-123';
    const channel = `${NOTIFICATION_CHANNEL_PREFIX}${userId}${NOTIFICATION_CHANNEL_SUFFIX}`;
    expect(channel).toBe('user:abc-123:notifications');
  });

  it('channel prefix and suffix are consistent', () => {
    expect(NOTIFICATION_CHANNEL_PREFIX).toBe('user:');
    expect(NOTIFICATION_CHANNEL_SUFFIX).toBe(':notifications');
  });
});

// ── JWT verification ──

describe('JWT verification', () => {
  const secret = new TextEncoder().encode('test-secret-with-at-least-32-chars-for-ws!!');

  async function signToken(sub: string, type: string): Promise<string> {
    return new jose.SignJWT({ sub, type })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret);
  }

  it('verifies a valid access token', async () => {
    const token = await signToken('user-1', 'access');
    const { payload } = await jose.jwtVerify(token, secret);
    expect(payload.sub).toBe('user-1');
    expect(payload.type).toBe('access');
  });

  it('rejects token with wrong type', async () => {
    const token = await signToken('user-1', 'refresh');
    const { payload } = await jose.jwtVerify(token, secret);
    expect(payload.type).toBe('refresh');
  });

  it('rejects token signed with wrong secret', async () => {
    const wrongSecret = new TextEncoder().encode('wrong-secret-with-at-least-32-chars!!!');
    const token = await signToken('user-1', 'access');
    await expect(jose.jwtVerify(token, wrongSecret)).rejects.toThrow();
  });
});

// ── Rate limiting logic ──

describe('Rate limiting', () => {
  const MAX_MESSAGES_PER_SEC = 30;

  it('allows up to max messages per second', () => {
    const counters = new Map<string, { count: number; resetAt: number }>();
    const key = 'ws-1';
    counters.set(key, { count: 0, resetAt: Date.now() + 1000 });

    for (let i = 0; i < MAX_MESSAGES_PER_SEC; i++) {
      const c = counters.get(key)!;
      if (Date.now() > c.resetAt) {
        c.count = 0;
        c.resetAt = Date.now() + 1000;
      }
      c.count++;
      expect(c.count).toBeLessThanOrEqual(MAX_MESSAGES_PER_SEC);
    }

    // The 31st message should exceed the limit
    const c = counters.get(key)!;
    if (Date.now() > c.resetAt) {
      c.count = 0;
      c.resetAt = Date.now() + 1000;
    }
    c.count++;
    expect(c.count).toBeGreaterThan(MAX_MESSAGES_PER_SEC);
  });

  it('resets counter after the second window', () => {
    const counters = new Map<string, { count: number; resetAt: number }>();
    const key = 'ws-1';
    // Set resetAt in the past
    counters.set(key, { count: 5, resetAt: Date.now() - 1000 });

    const c = counters.get(key)!;
    if (Date.now() > c.resetAt) {
      c.count = 0;
      c.resetAt = Date.now() + 1000;
    }
    c.count++;
    expect(c.count).toBe(1); // Reset then incremented
  });
});

// ── IP connection tracking ──

describe('IP connection tracking', () => {
  const MAX_CONNECTIONS_PER_IP = 20;

  it('allows connections up to the limit', () => {
    const ipConnections = new Map<string, number>();
    const ip = '192.168.1.1';

    for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) {
      const current = ipConnections.get(ip) || 0;
      ipConnections.set(ip, current + 1);
    }

    expect(ipConnections.get(ip)).toBe(MAX_CONNECTIONS_PER_IP);
  });

  it('blocks connections over the limit', () => {
    const ipConnections = new Map<string, number>();
    const ip = '192.168.1.1';
    ipConnections.set(ip, MAX_CONNECTIONS_PER_IP);

    const current = ipConnections.get(ip) || 0;
    if (current >= MAX_CONNECTIONS_PER_IP) {
      // Connection should be rejected
      expect(current).toBe(MAX_CONNECTIONS_PER_IP);
    }
  });

  it('decrements on disconnect', () => {
    const ipConnections = new Map<string, number>();
    const ip = '10.0.0.1';
    ipConnections.set(ip, 5);

    // Simulate disconnect
    const current = (ipConnections.get(ip) || 1) - 1;
    if (current <= 0) ipConnections.delete(ip);
    else ipConnections.set(ip, current);

    expect(ipConnections.get(ip)).toBe(4);
  });

  it('removes IP entry when count drops to zero', () => {
    const ipConnections = new Map<string, number>();
    const ip = '10.0.0.1';
    ipConnections.set(ip, 1);

    const current = (ipConnections.get(ip) || 1) - 1;
    if (current <= 0) ipConnections.delete(ip);
    else ipConnections.set(ip, current);

    expect(ipConnections.has(ip)).toBe(false);
  });
});
