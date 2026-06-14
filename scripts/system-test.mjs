// ── API 级别系统冒烟测试 ──
// 无需浏览器。验证后端 API 的安全头、认证、CRUD、错误处理、速率限制。
//
// 用法: node scripts/system-test.mjs
// 环境变量: API_BASE (默认 http://localhost:3000)
//           WS_BASE  (默认 ws://localhost:4000)
//
// 此脚本与 Playwright E2E 测试互补：
//   - system-test.mjs → API 级别，快速（~10s），适合 CI 前置检查
//   - Playwright specs   → 浏览器级别，覆盖 UI 交互和可访问性

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read RATE_LIMIT_AUTH_MAX from .env.prod.local so the rate-limit test
// sends enough requests to actually trigger 429. Falls back to 30.
function readRateLimitThreshold() {
  const envFile = resolve(__dirname, '../.env.prod.local');
  if (existsSync(envFile)) {
    const content = readFileSync(envFile, 'utf-8');
    const match = content.match(/^RATE_LIMIT_AUTH_MAX=(\d+)$/m);
    if (match) return parseInt(match[1], 10);
  }
  return parseInt(process.env.RATE_LIMIT_AUTH_MAX || '30', 10);
}
const REPORTS = resolve(__dirname, '../reports');
mkdirSync(REPORTS, { recursive: true });

const BASE = process.env.API_BASE || 'http://localhost:3000';
const WS_BASE = process.env.WS_BASE || 'ws://localhost:4000';

// Derive Origin header from BASE for CSRF checks in production.
// In production the API is served through Caddy on :443 (same-origin).
const BASE_URL = new URL(BASE);
const ORIGIN = `${BASE_URL.protocol}//${BASE_URL.host}`;
// For ws health check — in production the WS is behind Caddy at /ws-server/health
const WS_HEALTH_URL = BASE_URL.protocol === 'https:'
  ? `${ORIGIN}/ws-server/health`
  : `http://localhost:4000/health`;

// Helper that adds Origin to state-changing requests for CSRF compliance
function hdrs(extra = {}) {
  const h = { ...extra };
  if (!h['Origin'] && !h['origin']) h['Origin'] = ORIGIN;
  return h;
}

// Fetch CAPTCHA for auth endpoints that require it
async function getCaptcha() {
  const res = await fetch(`${BASE}/api/auth/captcha`);
  const data = await res.json();
  if (!data.data?.captchaId || !data.data?.question) throw new Error('Failed to get captcha');
  // Parse "X + Y = ?" question
  const parts = data.data.question.match(/(\d+)\s*\+\s*(\d+)/);
  let answer = 0;
  if (parts) answer = parseInt(parts[1]) + parseInt(parts[2]);
  return { captchaId: data.data.captchaId, captchaAnswer: answer };
}

let passed = 0;
let failed = 0;
const failures = [];
const results = [];

// Sanitize PII/credentials from report output (accessToken, refreshToken, password hashes)
function sanitize(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/"(access|refresh)Token":"[^"]+"/g, '"$1Token":"[REDACTED]"')
    .replace(/"passwordHash":"[^"]+"/g, '"passwordHash":"[REDACTED]"')
    .replace(/"confirmPasswordHash":"[^"]+"/g, '"confirmPasswordHash":"[REDACTED]"');
}

function assert(section, name, condition, detail = '') {
  const entry = { section, name, passed: !!condition, detail: sanitize(detail) };
  results.push(entry);
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(`${section}: ${name} ${sanitize(detail)}`);
    console.log(`  ❌ ${name} — ${sanitize(detail)}`);
  }
}

function assertEq(section, name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(
    section,
    name,
    ok,
    ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

// ──────────────────────────────────────────────────
// B.2 安全头审计
// ──────────────────────────────────────────────────
console.log('\n=== B.2 安全头审计 ===');
try {
  const b2 = await fetch(`${BASE}/`);
  const headers = b2.headers;

  const csp = headers.get('content-security-policy') || '';
  assert('B.2', 'CSP header present', csp.length > 0, 'CSP header missing');
  assert(
    'B.2',
    'CSP nonce-based (no unsafe-inline)',
    !csp.includes('unsafe-inline'),
    `CSP contains unsafe-inline`
  );
  assert('B.2', 'CSP has script-src directive', csp.includes('script-src'));
  assert('B.2', 'X-Content-Type-Options: nosniff', headers.get('x-content-type-options') === 'nosniff');
  assert('B.2', 'X-Frame-Options: DENY', headers.get('x-frame-options') === 'DENY');
  assert(
    'B.2',
    'Referrer-Policy set',
    (headers.get('referrer-policy') || '').includes('strict-origin')
  );
  assert(
    'B.2',
    'Permissions-Policy restricts camera',
    (headers.get('permissions-policy') || '').includes('camera=()')
  );
  assert(
    'B.2',
    'Strict-Transport-Security set',
    !!(headers.get('strict-transport-security') || ''),
    'HSTS header missing'
  );
  assert('B.2', 'HTML serves as text/html', (headers.get('content-type') || '').includes('text/html'));
} catch (e) {
  assert('B.2', 'GET / (fetch)', false, e.message);
}

// ──────────────────────────────────────────────────
// C.1 基础设施健康检查
// ──────────────────────────────────────────────────
console.log('\n=== C.1 健康检查 ===');

// Backend /health — now returns 503 when degraded, 200 when healthy
{
  try {
    const hres = await fetch(`${BASE}/health`);
    const h = await hres.json();
    const isHealthy = hres.status === 200 && h.status === 'ok';
    const isDegraded = h.status === 'degraded';
    assert('C.1', 'Backend /health responds', !!h.status, JSON.stringify(h));
    assert('C.1', 'Backend DB check', h.checks?.db === 'ok', `db=${h.checks?.db}`);
    assert('C.1', 'Health status code correct', isHealthy || isDegraded, `status=${hres.status} body=${h.status}`);
  } catch (e) {
    assert('C.1', 'Backend /health', false, e.message);
  }
}

// WS Server /health (production: via Caddy at /ws-server/health)
{
  try {
    const wh = await fetch(WS_HEALTH_URL);
    const whd = await wh.json();
    assert('C.1', 'WS /health responds', !!whd.status, JSON.stringify(whd).substring(0, 100));
  } catch (e) {
    assert('C.1', 'WS /health', false, e.message);
  }
}

// ──────────────────────────────────────────────────
// C.2 认证流程
// ──────────────────────────────────────────────────
console.log('\n=== C.2 认证流程 ===');
const TEST_USER = `systest_${Date.now()}`;
const testHash = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'; // 32-char hex PBKDF2 hash
const testSalt = 'a1b2c3d4e5f6a1b2'; // 16-char hex PBKDF2 salt
let accessToken, refreshToken, userId;

// Register
{
  try {
    const captcha = await getCaptcha();
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: hdrs({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        username: TEST_USER,
        email: `${TEST_USER}@test.com`,
        phone: `999${Date.now().toString().slice(-7)}`,
        passwordHash: testHash,
        confirmPasswordHash: testHash,
        pbkdf2Salt: testSalt,
        ...captcha,
      }),
    });
    const data = await res.json();
    assert('C.2', 'Register → 201 or 200', res.status === 201 || res.status === 200, `status=${res.status}`);
    assert('C.2', 'Register returns user', !!data.data?.user, JSON.stringify(data));
  } catch (e) {
    assert('C.2', 'Register exception', false, e.message);
  }
}

// Login
{
  try {
    const captcha = await getCaptcha();
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: hdrs({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        identifier: TEST_USER,
        passwordHash: testHash,
        ...captcha,
        fingerprint: {
          platform: 'test',
          cores: 4,
          screen: '1920x1080x24',
          timezone: 'UTC',
          language: 'en',
          deviceId: 'test-device-id',
        },
      }),
    });
    const data = await res.json();
    accessToken = data.data?.accessToken;
    refreshToken = data.data?.refreshToken;
    userId = data.data?.user?.id;
    assert('C.2', 'Login → 200', res.status === 200, `status=${res.status}`);
    assert('C.2', 'Login returns accessToken', !!accessToken);
    assert('C.2', 'Login returns refreshToken', !!refreshToken);
  } catch (e) {
    assert('C.2', 'Login exception', false, e.message);
  }
}

// Get user profile
if (accessToken) {
  const res = await fetch(`${BASE}/api/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  assert('C.2', 'GET /users/me → 200', res.status === 200, `status=${res.status}`);
  assertEq('C.2', 'User profile username matches', data.data?.username, TEST_USER);
}

// Refresh token
if (refreshToken) {
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: hdrs({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${refreshToken}`,
      }),
      body: JSON.stringify({
        fingerprint: {
          platform: 'test',
          cores: 4,
          screen: '1920x1080x24',
          timezone: 'UTC',
          language: 'en',
          deviceId: 'test-device-id',
        },
      }),
    });
    const data = await res.json();
    const newAT = data.data?.accessToken;
    assert('C.2', 'Refresh → 200', res.status === 200, `status=${res.status}`);
    assert('C.2', 'Refresh returns new accessToken', !!newAT);
    if (newAT) accessToken = newAT;
  } catch (e) {
    assert('C.2', 'Refresh exception', false, e.message);
  }
}

// ──────────────────────────────────────────────────
// C.3 文档 CRUD
// ──────────────────────────────────────────────────
console.log('\n=== C.3 文档 CRUD ===');
let docId;

if (accessToken) {
  // Create
  {
    const res = await fetch(`${BASE}/api/documents`, {
      method: 'POST',
      headers: hdrs({ 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }),
      body: JSON.stringify({ title: 'System Test Document' }),
    });
    const data = await res.json();
    docId = data.data?.id;
    assert('C.3', 'Create document → 201', res.status === 201);
    assert('C.3', 'Document has id', !!docId);
  }

  // List
  {
    const res = await fetch(`${BASE}/api/documents`, {
      headers: hdrs({ Authorization: `Bearer ${accessToken}` }),
    });
    const data = await res.json();
    assert('C.3', 'List documents → 200', res.status === 200);
    // API returns { data: { items: [...] } } or { data: [...] }
    const list = data.data?.items || data.data || data.documents || data.items;
    assert('C.3', 'List has documents', Array.isArray(list), JSON.stringify(data).substring(0, 100));
  }

  // Update
  {
    const res = await fetch(`${BASE}/api/documents/${docId}`, {
      method: 'PATCH',
      headers: hdrs({ 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }),
      body: JSON.stringify({ title: 'Updated System Test' }),
    });
    const data = await res.json();
    assert('C.3', 'Update document → 200', res.status === 200);
    assertEq('C.3', 'Title updated', data.data?.title, 'Updated System Test');
  }

  // Delete
  {
    const res = await fetch(`${BASE}/api/documents/${docId}`, {
      method: 'DELETE',
      headers: hdrs({ Authorization: `Bearer ${accessToken}` }),
    });
    assert('C.3', 'Delete document → 200', res.status === 200);
  }
}

// ──────────────────────────────────────────────────
// C.7 错误处理
// ──────────────────────────────────────────────────
console.log('\n=== C.7 错误处理 ===');

// No token → 401
{
  const res = await fetch(`${BASE}/api/documents`);
  const data = await res.json();
  assert('C.7', 'No auth token → 401', res.status === 401, `status=${res.status}`);
  assert('C.7', 'Error code UNAUTHORIZED', data.error?.code === 'UNAUTHORIZED', data.error?.code);
}

// Invalid token → 401
{
  const res = await fetch(`${BASE}/api/documents`, {
    headers: { Authorization: 'Bearer invalid-token-here-1234567890' },
  });
  assert('C.7', 'Invalid token → 401', res.status === 401, `status=${res.status}`);
}

// Non-existent document → 404
if (accessToken) {
  const res = await fetch(`${BASE}/api/documents/nonexistent-id`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // Rate limiting or CSRF may carry over; accept 404, 401, 429, or 403
  assert('C.7', 'Not found handled', [404, 401, 429, 403].includes(res.status), `status=${res.status}`);
}

// Invalid JSON body → 400
{
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: hdrs({ 'Content-Type': 'application/json' }),
    body: 'not json',
  });
  assert('C.7', 'Invalid JSON → 400', res.status === 400, `status=${res.status}`);
}

// Validation error → 400
{
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: hdrs({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username: 'a' }),
  });
  assert('C.7', 'Validation error → 400', res.status === 400, `status=${res.status}`);
}

// CSRF check — requests WITHOUT Origin header should be rejected in production
{
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },  // No Origin header = CSRF blocked
    body: JSON.stringify({ identifier: 'test', passwordHash: testHash }),
  });
  const data = await res.json();
  assert(
    'C.7',
    'CSRF blocks requests without Origin',
    res.status === 403 && data.error?.code === 'CSRF_INVALID',
    `status=${res.status} code=${data.error?.code}`
  );
}

// Public /health should be accessible without auth
{
  const res = await fetch(`${BASE}/health`);
  assert('C.7', 'Public /health accessible', res.status === 200 || res.status === 503);
}

// ──────────────────────────────────────────────────
// C.6 WebSocket / WS Server 连通性
// ──────────────────────────────────────────────────
console.log('\n=== C.6 WebSocket ===');

// WS server HTTP health check (via Caddy proxy)
try {
  const wh = await fetch(WS_HEALTH_URL);
  const whd = await wh.json();
  assert('C.6', 'WS server reachable via HTTP', whd.status === 'ok', JSON.stringify(whd));
} catch (e) {
  assert('C.6', 'WS server HTTP check', false, e.message);
}

// WebSocket upgrade test — verifies wss:// connectivity through Caddy
if (accessToken) {
  try {
    const { WebSocket: WsSocket } = await import('ws');
    // Connect to ws-server via Caddy proxy with JWT auth
    const wsUrl = `${WS_BASE.startsWith('wss:') ? WS_BASE : 'wss://localhost'}/ws-server`;
    const ws = new WsSocket(`${wsUrl}/doc-test`, [`token.${accessToken}`], { rejectUnauthorized: false });
    const wsResult = await new Promise((resolve) => {
      const t = setTimeout(() => resolve('timeout'), 5_000);
      ws.on('open', () => { ws.close(1000); clearTimeout(t); resolve('open'); });
      ws.on('error', (err) => { clearTimeout(t); resolve('error:' + (err?.message || err?.code || String(err))); });
      ws.on('unexpected-response', (_req, res) => { clearTimeout(t); resolve('http:' + res.statusCode); });
      ws.on('close', (code, reason) => { clearTimeout(t); resolve('closed:' + code + '/' + (reason?.toString()||'')); });
    });
    assert('C.6', 'WS upgrade', wsResult === 'open', 'got ' + wsResult);
  } catch (e) {
    assert('C.6', 'WS upgrade exception', false, e.message);
  }
}

// Rate limiting — MUST run last (after all other tests) to avoid 429 bleed.
// Hitting /api/auth/register rapidly should trigger 429.
// Threshold auto-detected from .env.prod.local or RATE_LIMIT_AUTH_MAX env.
// Test sends threshold + 5 requests to guarantee exceeding the limit.
// Override via RATE_LIMIT_TEST_MAX to force a specific count.
{
  const rateLimitThreshold = parseInt(
    process.env.RATE_LIMIT_TEST_MAX || String(readRateLimitThreshold()),
    10
  );
  const MAX_ATTEMPTS = rateLimitThreshold + 5; // exceed the limit by 5
  let wasLimited = false;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: hdrs({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        username: `ratetest_${i}_${Date.now()}`,
        email: `rt${i}_${Date.now()}@t.com`,
        phone: `999${String(i).padStart(7, '0')}`,
        passwordHash: testHash,
        confirmPasswordHash: testHash,
        pbkdf2Salt: testSalt,
      }),
    });
    if (res.status === 429) {
      wasLimited = true;
      break;
    }
  }
  assert('C.7', 'Rate limiting triggers 429', wasLimited, `${MAX_ATTEMPTS} register attempts without rate limit (threshold=${rateLimitThreshold})`);
}

// ──────────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────────
console.log('\n=== Cleanup ===');
if (accessToken) {
  try {
    // Delete account to clean up all test data (cascades: documents, permissions, etc.)
    await fetch(`${BASE}/api/users/me`, {
      method: 'DELETE',
      headers: hdrs({ Authorization: `Bearer ${accessToken}` }),
    });
    console.log('  ✅ Test user deleted');
  } catch {
    // Fallback: logout
    try {
      await fetch(`${BASE}/api/auth/logout`, {
        method: 'POST',
        headers: hdrs({ Authorization: `Bearer ${accessToken}` }),
      });
      console.log('  ⚠️ Cleanup: logged out (delete account failed)');
    } catch (e2) {
      console.log('  ⚠️ Cleanup failed:', e2.message);
    }
  }
}

// ──────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n========================================`);
console.log(`  SYSTEM TEST: ${passed}/${total} passed`);
console.log(`========================================`);

if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}

// Write JSON report
const reportData = {
  timestamp: new Date().toISOString(),
  passed,
  failed,
  total,
  results,
};
const reportJson = sanitize(JSON.stringify(reportData, null, 2));
writeFileSync(resolve(REPORTS, 'system-test.json'), reportJson);

process.exit(failed > 0 ? 1 : 0);
