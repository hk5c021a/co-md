/**
 * T119E: K6 Load Test — API Performance Validation
 *
 * Requirements:
 * - Sustained 50 req/s throughput with P95 < 500ms
 * - Health check, document list, and auth endpoints under load
 *
 * Run:
 *   k6 run apps/backend/tests/performance/t119e-k6-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'https://localhost';
const API_URL = __ENV.API_URL || `${BASE_URL}/api`;

// Custom metrics
const docListDuration = new Trend('doc_list_duration', true);
const healthDuration = new Trend('health_duration', true);
const captchaDuration = new Trend('captcha_duration', true);
const errorRate = new Rate('error_rate');

export const options = {
  scenarios: {
    // Constant arrival rate: 50 iterations per second for 30 seconds
    constant_load: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // P95 < 500ms
    http_req_failed: ['rate<0.05'],    // < 5% error rate
    doc_list_duration: ['p(95)<500'],
    health_duration: ['p(95)<300'],
    error_rate: ['rate<0.05'],
  },
};

// ── Test user (pre-created via API or manual setup) ──
// For meaningful results, create a test user before running:
//   curl -k -X POST https://localhost/api/auth/register ...
const TEST_USER = {
  identifier: __ENV.TEST_USER_ID || 'loadtest@test.co-md.local',
  password: __ENV.TEST_USER_PASS || 'LoadTestPass123!',
};

let accessToken = '';
let documentIds = [];

// ── Setup ──
export function setup() {
  // Try to login and get a token for document tests
  try {
    // Get CAPTCHA
    const captchaRes = http.get(`${BASE_URL}/api/auth/captcha`);
    if (captchaRes.status === 200) {
      const captchaBody = JSON.parse(captchaRes.body);
      if (captchaBody.success && captchaBody.data) {
        const captchaId = captchaBody.data.captchaId;
        const qMatch = captchaBody.data.question.match(/(\d+)\s*\+\s*(\d+)/);
        if (qMatch) {
          const captchaAnswer = parseInt(qMatch[1], 10) + parseInt(qMatch[2], 10);

          const loginRes = http.post(
            `${BASE_URL}/api/auth/login`,
            JSON.stringify({
              identifier: TEST_USER.identifier,
              passwordHash: TEST_USER.password, // Expects pre-hashed in production
              captchaId,
              captchaAnswer,
              fingerprint: {
                platform: 'K6',
                cores: 4,
                screen: '1920x1080',
                timezone: 'UTC',
                language: 'en',
                deviceId: 'k6-load-test',
              },
            }),
            { headers: { 'Content-Type': 'application/json', Origin: BASE_URL } }
          );

          if (loginRes.status === 200) {
            const loginBody = JSON.parse(loginRes.body);
            if (loginBody.success) {
              accessToken = loginBody.data.accessToken;
              console.log('[setup] Authenticated successfully');
            } else {
              console.log('[setup] Auth failed — running unauthenticated tests only');
            }
          }
        }
      }
    }
  } catch (e) {
    console.log(`[setup] Auth error: ${e.message} — running unauthenticated tests only`);
  }

  return { accessToken };
}

// ── Main test ──
export default function (data) {
  const token = data.accessToken;

  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/health`);
    healthDuration.add(res.timings.duration);
    const ok = check(res, {
      'health: status 200': (r) => r.status === 200,
      'health: json ok': (r) => {
        try {
          return JSON.parse(r.body).status === 'ok';
        } catch {
          return false;
        }
      },
    });
    if (!ok) errorRate.add(1);
  });

  group('CAPTCHA', () => {
    const res = http.get(`${API_URL}/auth/captcha`);
    captchaDuration.add(res.timings.duration);
    const ok = check(res, {
      'captcha: status 200': (r) => r.status === 200,
      'captcha: has data': (r) => {
        try {
          const b = JSON.parse(r.body);
          return b.success && b.data?.captchaId;
        } catch {
          return false;
        }
      },
    });
    if (!ok) errorRate.add(1);
  });

  // Document list (requires auth)
  if (token) {
    group('Document List', () => {
      const res = http.get(`${API_URL}/documents`, {
        headers: { Authorization: `Bearer ${token}`, Origin: BASE_URL },
      });
      docListDuration.add(res.timings.duration);
      const ok = check(res, {
        'documents: status 200': (r) => r.status === 200,
      });
      if (!ok) errorRate.add(1);
    });
  }

  // Small sleep to avoid overwhelming rate-limit (30 req/60s on auth endpoints)
  sleep(0.1);
}

// ── Teardown ──
export function teardown(data) {
  console.log('[teardown] Load test complete');
}

// ── Summary ──
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    target: BASE_URL,
    duration_seconds: data.state?.testRunDurationMs / 1000 || 0,
    metrics: {
      http_reqs: data.metrics.http_reqs?.values?.count || 0,
      http_req_duration_p95: data.metrics.http_req_duration?.values?.['p(95)'] || 0,
      http_req_failed_rate: data.metrics.http_req_failed?.values?.rate || 0,
      error_rate: data.metrics.error_rate?.values?.rate || 0,
      doc_list_p95: data.metrics.doc_list_duration?.values?.['p(95)'] || 'N/A',
      health_p95: data.metrics.health_duration?.values?.['p(95)'] || 'N/A',
    },
    thresholds: {
      'http_req_duration p95 < 500': (data.metrics.http_req_duration?.values?.['p(95)'] || 0) < 500,
      'http_req_failed < 5%': (data.metrics.http_req_failed?.values?.rate || 0) < 0.05,
    },
  };

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'load-test-summary.json': JSON.stringify(summary, null, 2),
  };
}
