// Collaborative editing test — simulates two clients connected to the same document
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE = 'https://localhost';
const DOC_ID = 'collab-test-' + Date.now();

async function getToken(username) {
  const cap = await (await fetch(`${BASE}/api/auth/captcha`)).json();
  const q = cap.data.question.match(/(\d+)\s*\+\s*(\d+)/);
  const a = parseInt(q[1]) + parseInt(q[2]);
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ username, email: username + '@t.com', phone: '999' + Math.random().toString().slice(2, 9), passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', confirmPasswordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', pbkdf2Salt: 'a1b2c3d4e5f6a1b2', captchaId: cap.data.captchaId, captchaAnswer: a }),
  });
  const rd = await reg.json();
  if (reg.status !== 201 && reg.status !== 200) throw new Error(`Register(${username}): ${rd.error?.code}`);
  const cap2 = await (await fetch(`${BASE}/api/auth/captcha`)).json();
  const q2 = cap2.data.question.match(/(\d+)\s*\+\s*(\d+)/);
  const a2 = parseInt(q2[1]) + parseInt(q2[2]);
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ identifier: username, passwordHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', captchaId: cap2.data.captchaId, captchaAnswer: a2, fingerprint: { platform: 'test', cores: 4, screen: '1920x1080x24', timezone: 'UTC', language: 'en', deviceId: 'test-' + Date.now() } }),
  });
  const ld = await login.json();
  if (!ld.data?.accessToken) throw new Error(`Login(${username}): no token`);
  return ld.data.accessToken;
}

async function deleteUser(token) {
  await fetch(`${BASE}/api/users/me`, {
    method: 'DELETE',
    headers: { Origin: BASE, Authorization: 'Bearer ' + token },
  }).catch(() => {});
}

async function connectWs(docId, token) {
  const ws = new WebSocket(`wss://localhost/ws-server/${docId}`, ['token.' + token], { rejectUnauthorized: false });
  ws.binaryType = 'arraybuffer';
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
    ws.on('open', () => { clearTimeout(t); resolve(); });
    ws.on('error', (e) => { clearTimeout(t); reject(new Error(e.message)); });
  });
  return ws;
}

async function main() {
  console.log('=== Collaboration Test ===');
  console.log('Doc ID:', DOC_ID);

  // Get tokens
  const tokenA = await getToken('collabA_' + Date.now());
  const tokenB = await getToken('collabB_' + Date.now());
  console.log('✅ Tokens obtained');

  // Client A connects (creator)
  const wsA = await connectWs(DOC_ID, tokenA);
  console.log('✅ Client A (creator) connected');

  // Client B connects (contact)
  const wsB = await connectWs(DOC_ID, tokenB);
  console.log('✅ Client B (contact) connected');

  // Set up message tracking
  let bReceived = false;
  let aReceived = false;
  wsB.on('message', (data) => { bReceived = true; });
  wsA.on('message', (data) => { aReceived = true; });

  // A sends update → should reach B
  const doc = new Y.Doc();
  doc.getText('content').insert(0, 'Hello from A');
  const update = Y.encodeStateAsUpdate(doc);
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 0);
  encoding.writeVarUint8Array(enc, update);
  wsA.send(encoding.toUint8Array(enc));
  await new Promise(r => setTimeout(r, 500));
  console.log('A→B:', bReceived ? '✅ RECEIVED' : '❌ NOT RECEIVED');

  // Reset
  bReceived = false;

  // B sends update → should reach A
  const docB = new Y.Doc();
  docB.getText('content').insert(0, 'Hello from B');
  const updateB = Y.encodeStateAsUpdate(docB);
  const encB = encoding.createEncoder();
  encoding.writeVarUint(encB, 0);
  encoding.writeVarUint8Array(encB, updateB);
  wsB.send(encoding.toUint8Array(encB));
  await new Promise(r => setTimeout(r, 500));
  console.log('B→A:', aReceived ? '✅ RECEIVED' : '❌ NOT RECEIVED');

  // Cleanup
  wsA.close();
  wsB.close();
  await deleteUser(tokenA);
  await deleteUser(tokenB);
  console.log('✅ Cleanup done');

  if (bReceived && aReceived) {
    console.log('\n🎉 Bidirectional collaboration works correctly!');
    process.exit(0);
  } else {
    console.log('\n❌ Collaboration broken');
    process.exit(1);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
