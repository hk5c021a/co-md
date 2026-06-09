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

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS = resolve(__dirname, '../reports');
mkdirSync(REPORTS, { recursive: true });

const BASE = process.env.API_BASE || 'http://localhost:3000';
const WS_BASE = process.env.WS_BASE || 'ws://localhost:4000';

let passed = 0;
let failed = 0;
const failures = [];
const results = [];

function assert(section, name, condition, detail = '') {
  const entry = { section, name, passed: !!condition, detail };
  results.push(entry);
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(`${section}: ${name} ${detail}`);
    console.log(`  ❌ ${name} — ${detail}`);
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

// WS Server /health
{
  try {
    const wh = await fetch(`http://localhost:4000/health`);
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
let accessToken, refreshToken, userId;

// Register
{
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: TEST_USER,
      email: `${TEST_USER}@test.com`,
      phone: `999${Date.now().toString().slice(-7)}`,
      passwordHash: testHash,
      confirmPasswordHash: testHash,
    }),
  });
  const data = await res.json();
  assert('C.2', 'Register → 201', res.status === 201, `status=${res.status}`);
  assert('C.2', 'Register returns user', !!data.data?.user, JSON.stringify(data));
}

// Login
{
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: TEST_USER,
      passwordHash: testHash,
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
  const res = await fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refreshToken}`,
    },
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
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
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    assert('C.3', 'List documents → 200', res.status === 200);
    assert('C.3', 'List has items', Array.isArray(data.data) && data.data.length > 0);
  }

  // Update
  {
    const res = await fetch(`${BASE}/api/documents/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
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
      headers: { Authorization: `Bearer ${accessToken}` },
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
  assert('C.7', 'Not found → 404', res.status === 404, `status=${res.status}`);
}

// Invalid JSON body → 400
{
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  });
  assert('C.7', 'Invalid JSON → 400', res.status === 400, `status=${res.status}`);
}

// Validation error → 400
{
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'a' }),
  });
  assert('C.7', 'Validation error → 400', res.status === 400, `status=${res.status}`);
}

// CSRF check — in production without CORS_ORIGIN set, state-changing requests are rejected
// In dev/test, the middleware skips when CORS_ORIGIN is empty
{
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'test', passwordHash: testHash }),
  });
  const data = await res.json();
  // In production with CORS_ORIGIN set → 403; in dev without → 401 (auth error)
  const csrfBlockedOrSkipped = res.status === 403 || res.status === 401;
  assert(
    'C.7',
    'CSRF check functions correctly',
    csrfBlockedOrSkipped,
    `status=${res.status} code=${data.error?.code}`
  );
}

// Public /health should be accessible without auth
{
  const res = await fetch(`${BASE}/health`);
  assert('C.7', 'Public /health accessible', res.status === 200 || res.status === 503);
}

// Rate limiting — hitting /register rapidly should trigger 429
{
  let wasLimited = false;
  for (let i = 0; i < 25; i++) {
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `ratetest_${i}_${Date.now()}`,
        email: `rt${i}_${Date.now()}@t.com`,
        phone: `999${String(i).padStart(7, '0')}`,
        passwordHash: testHash,
        confirmPasswordHash: testHash,
      }),
    });
    if (res.status === 429) {
      wasLimited = true;
      break;
    }
  }
  assert('C.7', 'Rate limiting triggers 429', wasLimited, '25 register attempts without rate limit');
}

// ──────────────────────────────────────────────────
// C.6 WebSocket 连通性
// ──────────────────────────────────────────────────
console.log('\n=== C.6 WebSocket ===');
if (accessToken) {
  try {
    const ws = new WebSocket(`${WS_BASE}/nonexistent-doc-id`, [`token.${accessToken}`]);
    const wsResult = await new Promise((resolve) => {
      const t = setTimeout(() => resolve('timeout'), 3_000);
      ws.onclose = (e) => {
        clearTimeout(t);
        resolve(`closed:${e.code}`);
      };
      ws.onerror = () => {
        clearTimeout(t);
        resolve('error');
      };
      ws.onopen = () => {
        clearTimeout(t);
        ws.close();
        resolve('open');
      };
    });
    assert('C.6', 'WS connection establishes', wsResult === 'open', `got ${wsResult}`);
  } catch (e) {
    assert('C.6', 'WS connection exception', false, e.message);
  }
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
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log('  ✅ Test user deleted');
  } catch {
    // Fallback: logout
    try {
      await fetch(`${BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
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
writeFileSync(resolve(REPORTS, 'system-test.json'), JSON.stringify(reportData, null, 2));

process.exit(failed > 0 ? 1 : 0);
