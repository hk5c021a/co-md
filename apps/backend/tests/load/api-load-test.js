// K6 Load Test for Collab Backend API
// Uses a pre-generated access token (set TEST_TOKEN env var).
// Generate token first: curl to fetch CAPTCHA + login or use E2E fixture.
//
// Run: TEST_TOKEN=<token> k6 run --insecure-skip-tls-verify api-load-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const documentsTrend = new Trend('documents_duration');
const searchTrend = new Trend('search_duration');
const permissionsTrend = new Trend('permissions_duration');

export const options = {
  scenarios: {
    warmup: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ duration: '30s', target: 100 }],
      gracefulStop: '10s',
    },
    sustained_load: {
      executor: 'constant-arrival-rate',
      duration: '2m',
      rate: 500,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 1000,
      gracefulStop: '10s',
    },
    spike: {
      executor: 'ramping-arrival-rate',
      startTime: '2m30s',
      startRate: 100,
      preAllocatedVUs: 50,
      maxVUs: 500,
      stages: [{ duration: '30s', target: 1000 }],
      gracefulStop: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.05'],
    documents_duration: ['p(95)<300'],
    search_duration: ['p(95)<500'],
    permissions_duration: ['p(95)<200'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://localhost';
const AUTH_TOKEN = __ENV.TEST_TOKEN || '';

export function setup() {
  if (!AUTH_TOKEN) {
    console.error('TEST_TOKEN env var is required. Generate one via:');
    console.error('  1. Start the server');
    console.error('  2. Use Playwright E2E fixture api.register() to create a user');
    console.error('  3. Copy the accessToken value');
    console.error('  4. Run: TEST_TOKEN=<token> k6 run ...');
    throw new Error('No TEST_TOKEN provided');
  }
  return { token: AUTH_TOKEN };
}

function authHeaders(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}

export default function (data) {
  const headers = data.token ? authHeaders(data.token) : {};
  const scenario = Math.floor(Math.random() * 4);

  switch (scenario) {
    case 0: testDocumentsList(headers); break;
    case 1: testSearchUsers(headers); break;
    case 2: testPermissionsCheck(headers); break;
    case 3: testNotifications(headers); break;
  }

  sleep(0.1 + Math.random() * 0.2);
}

function testDocumentsList(headers) {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/documents`, headers);
  const duration = Date.now() - start;
  documentsTrend.add(duration);
  const ok = check(res, { 'docs 200': (r) => r.status === 200 });
  errorRate.add(!ok);
}

function testSearchUsers(headers) {
  const start = Date.now();
  const q = ['user', 'test', 'admin', 'guest', 'demo'][Math.floor(Math.random() * 5)];
  const res = http.get(`${BASE_URL}/api/contacts/search?q=${q}`, headers);
  const duration = Date.now() - start;
  searchTrend.add(duration);
  const ok = check(res, { 'search 200': (r) => r.status === 200 });
  errorRate.add(!ok);
}

function testPermissionsCheck(headers) {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/permissions/me/permissions`, headers);
  const duration = Date.now() - start;
  permissionsTrend.add(duration);
  const ok = check(res, { 'perms 200': (r) => r.status === 200 });
  errorRate.add(!ok);
}

function testNotifications(headers) {
  const res = http.get(`${BASE_URL}/api/notifications`, headers);
  const ok = check(res, { 'notifs 200': (r) => r.status === 200 });
  errorRate.add(!ok);
}

export function handleSummary(data) {
  const m = data.metrics;
  let s = '\n' + '='.repeat(60) + '\n  LOAD TEST SUMMARY\n' + '='.repeat(60) + '\n\n';
  s += `Total Requests: ${data.state.iterationCount || 0}\n`;
  s += `Error Rate: ${((m.errors?.values?.rate || 0) * 100).toFixed(1)}%\n`;
  s += `Duration: ${(data.state.testRunDurationMs / 1000).toFixed(0)}s\n`;
  s += `Max VUs: ${data.state.maxVUs || 'N/A'}\n\n`;
  s += 'Response Time (ms):\n';
  s += `  avg:   ${m.http_req_duration.values.avg?.toFixed(2) || 'N/A'}\n`;
  s += `  p(95): ${m.http_req_duration.values['p(95)']?.toFixed(2) || 'N/A'}\n`;
  s += `  p(99): ${m.http_req_duration.values['p(99)']?.toFixed(2) || 'N/A'}\n\n`;
  s += 'Checks Passed: ' + (data.checks.passed || 0) + ' / Failed: ' + (data.checks.failed || 0) + '\n';
  s += '='.repeat(60) + '\n';
  return { stdout: s, 'load-test-results.json': JSON.stringify(data, null, 2) };
}
