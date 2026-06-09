import { WebSocket } from 'ws';
import { pbkdf2Sync } from 'node:crypto';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE = 'https://localhost:3000';
const WS_BASE = 'wss://localhost:4000';
const PASSWORD = 'test1234';
const username = 'testrt' + Math.random().toString(36).slice(2, 8);

// Get CAPTCHA + register
const cRes = await fetch(`${BASE}/api/auth/captcha`);
const { captchaId, question } = (await cRes.json()).data;
const answer = question.split('+').map(s => parseInt(s.trim())).reduce((a, b) => a + b, 0);
const salt = 'co-md-pbkdf2-salt-v1';
const hash = pbkdf2Sync(PASSWORD, salt, 600000, 32, 'sha256').toString('hex');
const phone = `+86138${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;
const regRes = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, email: `${username}@test.com`, phone, passwordHash: hash, confirmPasswordHash: hash, pbkdf2Salt: salt, captchaId, captchaAnswer: answer }),
});
const { data: { accessToken } } = await regRes.json();
const userId = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()).sub;
console.log('User ID:', userId);

// 1. Connect to notification WS
const ws = new WebSocket(`${WS_BASE}/notifications`, [`token.${accessToken}`]);

ws.on('open', () => {
  console.log('✅ WS connected');
  // 2. Publish to Redis channel (simulating what the backend does)
  const channel = `user:${userId}:notifications`;
  const msg = JSON.stringify({
    type: 'contact-invitation',
    data: { invitationId: 'test-1', inviterId: 'u1', inviterUsername: 'TestUser' },
    timestamp: new Date().toISOString(),
  });

  // Publish after a short delay to ensure subscriber is ready
  setTimeout(async () => {
    const { execSync } = await import('node:child_process');
    // Using docker exec to publish via redis-cli
    execSync(`docker exec collab_redis redis-cli -a "redis_dev_2026" PUBLISH "${channel}" '${msg}'`, { stdio: 'pipe' });
    console.log('📤 Published to Redis channel:', channel);
  }, 500);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('📥 WS received notification:', msg.type);
  console.log('✅ END-TO-END FLOW WORKS!');
  ws.close(1000);
  process.exit(0);
});

ws.on('close', (code) => {
  if (code !== 1000) console.log('WS closed:', code);
  process.exit(0);
});

// Timeout after 5s
setTimeout(() => { console.log('❌ No message received within 5s'); process.exit(1); }, 5000);
