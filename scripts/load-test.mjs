// ── Simple HTTP load test (k6 alternative) ──
// Usage: node scripts/load-test.mjs [target] [duration_seconds]
// Default: https://localhost 30

const TARGET = process.argv[2] || 'https://localhost';
const DURATION = parseInt(process.argv[3] || '30', 10);
const CONCURRENCY = 10;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const started = Date.now();
let reqs = 0;
let errors = 0;
const latencies = [];

async function worker(id) {
  while (Date.now() - started < DURATION * 1000) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${TARGET}/health`);
      await res.text();
      reqs++;
      latencies.push(Date.now() - t0);
    } catch {
      errors++;
    }
  }
}

console.log(`Load test: ${TARGET}/health, ${DURATION}s, ${CONCURRENCY} workers`);
const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
await Promise.all(workers);

const elapsed = (Date.now() - started) / 1000;
latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)];
const p95 = latencies[Math.floor(latencies.length * 0.95)];
const p99 = latencies[Math.floor(latencies.length * 0.99)];
const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
const rps = Math.round(reqs / elapsed);

console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  target: TARGET,
  duration_seconds: Math.round(elapsed),
  concurrency: CONCURRENCY,
  metrics: {
    total_requests: reqs,
    requests_per_second: rps,
    error_count: errors,
    error_rate: (errors / (reqs + errors) * 100).toFixed(2) + '%',
    latency_avg_ms: Math.round(avg),
    latency_p50_ms: p50,
    latency_p95_ms: p95,
    latency_p99_ms: p99,
  },
  thresholds: {
    'p95 < 500ms': p95 < 500,
    'error_rate < 5%': (errors / (reqs + errors)) < 0.05,
  },
}, null, 2));
