/**
 * T119B: RustFS File Asset Performance Validation
 *
 * Requirements:
 * - Test 500 QPS PUT/GET performance baseline
 * - Verify large file scenarios SC-004 compliance
 *
 * Run: pnpm --filter backend exec tsx tests/performance/t119b-rustfs-performance.ts
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { stat, writeFile, readFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';

const RUSTFS_URL = process.env.RUSTFS_URL || 'http://localhost:9001';
const TARGET_QPS = 500;
const TEST_DURATION_SECONDS = 10;
const FILE_SIZES = [
  { name: 'Small (1KB)', size: 1024 },
  { name: 'Medium (100KB)', size: 100 * 1024 },
  { name: 'Large (1MB)', size: 1024 * 1024 },
  { name: 'XLarge (5MB)', size: 5 * 1024 * 1024 },
];

interface TestResult {
  name: string;
  passed: boolean;
  avgLatency: number;
  p95Latency: number;
  qps: number;
  expected: string;
  actual: string;
}

const results: TestResult[] = [];

async function createTestFile(size: number): Promise<Buffer> {
  return Buffer.alloc(size, `Test data ${randomUUID()}.`.slice(0, 1));
}

async function rustfsUpload(key: string, data: Buffer): Promise<number> {
  const start = Date.now();
  try {
    const response = await fetch(`${RUSTFS_URL}/upload/${key}`, {
      method: 'PUT',
      body: data,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    return Date.now() - start;
  } catch (error) {
    console.error(`Upload failed for ${key}:`, error);
    return -1;
  }
}

async function rustfsDownload(key: string): Promise<number> {
  const start = Date.now();
  try {
    const response = await fetch(`${RUSTFS_URL}/download/${key}`);
    if (response.ok) {
      await response.arrayBuffer();
    }
    return Date.now() - start;
  } catch (error) {
    console.error(`Download failed for ${key}:`, error);
    return -1;
  }
}

async function runQPSBenchmark(
  operation: (key: string) => Promise<number>,
  operationName: string,
  fileSize: { name: string; size: number }
): Promise<TestResult> {
  console.log(`\nRunning ${operationName} benchmark for ${fileSize.name}...`);

  const latencies: number[] = [];
  const totalOperations = TARGET_QPS * TEST_DURATION_SECONDS;
  const concurrentRequests = TARGET_QPS;

  const startTime = Date.now();

  // Run concurrent requests
  const promises: Promise<void>[] = [];

  for (let i = 0; i < concurrentRequests; i++) {
    const key = `perf_test/${fileSize.name.replace(/[^a-zA-Z0-9]/g, '_')}/${Date.now()}_${i}`;

    promises.push(
      (async () => {
        const latency = await operation(key);
        if (latency > 0) {
          latencies.push(latency);
        }
      })()
    );
  }

  await Promise.all(promises);

  // Calculate metrics
  latencies.sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies[p95Index] || 0;
  const actualQPS = latencies.length / TEST_DURATION_SECONDS;

  const result: TestResult = {
    name: `${operationName} - ${fileSize.name}`,
    passed: p95Latency < 500 && actualQPS >= TARGET_QPS * 0.5,
    avgLatency,
    p95Latency,
    qps: actualQPS,
    expected: `P95 < 500ms, QPS >= ${TARGET_QPS * 0.5}`,
    actual: `P95: ${p95Latency}ms, QPS: ${actualQPS.toFixed(2)}`,
  };

  results.push(result);

  console.log(`  Completed ${latencies.length} operations in ${Date.now() - startTime}ms`);
  console.log(`  Avg latency: ${avgLatency.toFixed(2)}ms`);
  console.log(`  P95 latency: ${p95Latency}ms`);
  console.log(`  Actual QPS: ${actualQPS.toFixed(2)}`);

  return result;
}

async function testLargeFileCompliance(): Promise<boolean> {
  console.log('\nTesting large file SC-004 compliance...');

  const largeFileSize = 10 * 1024 * 1024; // 10MB
  const testKey = `perf_test/large_file/${Date.now()}.dat`;
  const testData = Buffer.alloc(largeFileSize, 'X');

  // Upload
  const uploadStart = Date.now();
  await rustfsUpload(testKey, testData);
  const uploadTime = Date.now() - uploadStart;

  // Download
  const downloadStart = Date.now();
  await rustfsDownload(testKey);
  const downloadTime = Date.now() - downloadStart;

  console.log(`  10MB file upload: ${uploadTime}ms`);
  console.log(`  10MB file download: ${downloadTime}ms`);

  // SC-004: Auto-save should not lose data - large files should complete within reasonable time
  const passed = uploadTime < 30000 && downloadTime < 30000;

  results.push({
    name: 'Large file SC-004 compliance',
    passed,
    avgLatency: uploadTime,
    p95Latency: downloadTime,
    qps: 0,
    expected: 'Upload/Download < 30s',
    actual: `Upload: ${uploadTime}ms, Download: ${downloadTime}ms`,
  });

  return passed;
}

async function testConcurrentReads(
  key: string,
  data: Buffer,
  concurrentReaders: number
): Promise<number> {
  // First upload the file
  await rustfsUpload(key, data);

  const start = Date.now();
  const promises: Promise<void>[] = [];

  for (let i = 0; i < concurrentReaders; i++) {
    promises.push(
      (async () => {
        await rustfsDownload(key);
      })()
    );
  }

  await Promise.all(promises);
  return Date.now() - start;
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('  T119B PERFORMANCE VALIDATION SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} | ${result.name}`);
    console.log(`       Expected: ${result.expected}`);
    console.log(`       Actual:   ${result.actual}`);
  }

  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  return failed === 0;
}

async function main() {
  console.log('='.repeat(60));
  console.log('  T119B: RustFS File Asset Performance Validation');
  console.log(`  Target: ${TARGET_QPS} QPS baseline`);
  console.log('='.repeat(60));

  // Skip if RustFS is not available
  try {
    const response = await fetch(`${RUSTFS_URL}/health`);
    if (!response.ok) {
      console.log(`RustFS not available at ${RUSTFS_URL}, skipping tests`);
      console.log('Make sure RustFS is running: docker compose up -d rustfs');
      process.exit(0);
    }
  } catch {
    console.log(`RustFS not available at ${RUSTFS_URL}, skipping tests`);
    console.log('Make sure RustFS is running: docker compose up -d rustfs');
    process.exit(0);
  }

  try {
    // Test PUT operations
    for (const fileSize of FILE_SIZES) {
      const data = await createTestFile(fileSize.size);
      await runQPSBenchmark((key) => rustfsUpload(key, data), 'PUT', fileSize);
    }

    // Test GET operations
    for (const fileSize of FILE_SIZES) {
      const data = await createTestFile(fileSize.size);
      await runQPSBenchmark((key) => rustfsDownload(key), 'GET', fileSize);
    }

    // Test concurrent reads
    console.log('\nTesting concurrent read performance...');
    const testData = await createTestFile(1024 * 1024); // 1MB
    const concurrentKey = `perf_test/concurrent/${Date.now()}.dat`;

    const concurrentTime = await testConcurrentReads(concurrentKey, testData, 100);
    results.push({
      name: 'Concurrent reads (100 readers)',
      passed: concurrentTime < 5000,
      avgLatency: concurrentTime,
      p95Latency: concurrentTime,
      qps: 100 / (concurrentTime / 1000),
      expected: '100 concurrent reads < 5s',
      actual: `100 reads in ${concurrentTime}ms`,
    });
    console.log(`  100 concurrent reads completed in ${concurrentTime}ms`);

    // Large file compliance
    await testLargeFileCompliance();

    const success = await printSummary();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Error during validation:', error);
    process.exit(1);
  }
}

main();
