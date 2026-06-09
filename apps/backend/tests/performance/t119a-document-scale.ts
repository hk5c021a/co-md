/**
 * T119A: PostgreSQL Document Scale Validation
 *
 * Requirements:
 * - Generate 100,000 Document test records
 * - Verify file list query < 200ms
 * - Check necessary indexes (ownerId, updatedAt)
 *
 * Run: pnpm --filter backend exec tsx tests/performance/t119a-document-scale.ts
 */

import { db } from '../../src/db/index.js';
import { documents, users } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const TEST_USER_COUNT = 100;
const DOCUMENT_COUNT = 100000;
const BATCH_SIZE = 5000;

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  expected: string;
  actual: string;
}

const results: TestResult[] = [];

async function createTestUsers() {
  console.log(`Creating ${TEST_USER_COUNT} test users...`);
  const start = Date.now();

  const userIds: string[] = [];
  for (let i = 0; i < TEST_USER_COUNT; i++) {
    const userId = randomUUID();
    userIds.push(userId);
    await db.execute(sql`
      INSERT INTO users (id, username, email, phone, password_hash, created_at, updated_at)
      VALUES (
        ${userId},
        ${`perfuser_${i}_${Date.now()}`},
        ${`perfuser_${i}_${Date.now()}@example.com`},
        ${`123456${String(i).padStart(7, '0')}`.slice(0, 15)},
        '$2b$10$hashedpassword',
        NOW(),
        NOW()
      )
    `);
  }

  const duration = Date.now() - start;
  results.push({
    name: 'Create test users',
    passed: userIds.length === TEST_USER_COUNT,
    duration,
    expected: `${TEST_USER_COUNT} users`,
    actual: `${userIds.length} users created`,
  });

  console.log(`  Created ${userIds.length} users in ${duration}ms`);
  return userIds;
}

async function createTestDocuments(ownerIds: string[]) {
  console.log(`Creating ${DOCUMENT_COUNT} test documents in batches of ${BATCH_SIZE}...`);
  const start = Date.now();

  for (let batch = 0; batch < DOCUMENT_COUNT / BATCH_SIZE; batch++) {
    const batchStart = Date.now();
    const values: string[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      const ownerId = ownerIds[Math.floor(Math.random() * ownerIds.length)];
      const docId = randomUUID();
      const now = new Date().toISOString();

      values.push(
        `('${docId}', '${ownerId}', 'Test Document ${batch * BATCH_SIZE + i}', '# Content', '${now}', '${now}')`
      );
    }

    await db.execute(sql`
      INSERT INTO documents (id, owner_id, title, content, created_at, updated_at)
      VALUES ${sql.raw(values.join(', '))}
    `);

    const batchDuration = Date.now() - batchStart;
    const progress = Math.round(((batch + 1) / (DOCUMENT_COUNT / BATCH_SIZE)) * 100);
    console.log(
      `  Batch ${batch + 1}/${DOCUMENT_COUNT / BATCH_SIZE} - ${progress}% (${batchDuration}ms)`
    );
  }

  const duration = Date.now() - start;
  results.push({
    name: `Create ${DOCUMENT_COUNT} documents`,
    passed: true,
    duration,
    expected: 'Documents created',
    actual: `${DOCUMENT_COUNT} documents created in ${duration}ms`,
  });

  console.log(`  Total: ${DOCUMENT_COUNT} documents in ${duration}ms`);
}

async function checkIndexes() {
  console.log('\nChecking database indexes...');
  const start = Date.now();

  const indexes = await db.execute(sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'documents'
    AND indexname IN ('documents_owner_id_idx', 'documents_updated_at_idx')
  `);

  const indexNames = indexes.map((idx: { indexname: string }) => idx.indexname);
  const requiredIndexes = ['documents_owner_id_idx', 'documents_updated_at_idx'];

  const duration = Date.now() - start;
  results.push({
    name: 'Check required indexes',
    passed: requiredIndexes.every((idx) => indexNames.includes(idx)),
    duration,
    expected: requiredIndexes.join(', '),
    actual: indexNames.join(', ') || 'No indexes found',
  });

  console.log(`  Found indexes: ${indexNames.join(', ') || 'None'}`);
  return requiredIndexes.every((idx) => indexNames.includes(idx));
}

async function testDocumentListQuery(ownerId: string) {
  console.log('\nTesting document list query performance...');

  // Test 1: Get all documents for owner (pagination)
  const start1 = Date.now();
  const docs1 = await db.execute(sql`
    SELECT id, title, updated_at
    FROM documents
    WHERE owner_id = ${ownerId}
    ORDER BY updated_at DESC
    LIMIT 50
  `);
  const duration1 = Date.now() - start1;

  results.push({
    name: 'Document list query (owner, 50 items)',
    passed: duration1 < 200,
    duration: duration1,
    expected: '< 200ms',
    actual: `${duration1}ms`,
  });
  console.log(`  Owner document list (50 items): ${duration1}ms - ${docs1.length} documents`);

  // Test 2: Full table scan test (count)
  const start3 = Date.now();
  const count = await db.execute(sql`SELECT COUNT(*) as count FROM documents`);
  const duration3 = Date.now() - start3;

  results.push({
    name: 'Document count query',
    passed: duration3 < 500,
    duration: duration3,
    expected: '< 500ms',
    actual: `${duration3}ms`,
  });
  console.log(`  Document count: ${count[0]?.count || 0} in ${duration3}ms`);
}

async function cleanup() {
  console.log('\nCleaning up test data...');
  await db.execute(sql`DELETE FROM documents WHERE title LIKE 'Test Document%'`);
  await db.execute(sql`DELETE FROM users WHERE username LIKE 'perfuser_%'`);
  console.log('  Cleanup complete');
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('  T119A PERFORMANCE VALIDATION SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} | ${result.name}`);
    console.log(`       Expected: ${result.expected}`);
    console.log(`       Actual:   ${result.actual} (${result.duration}ms)`);
  }

  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  return failed === 0;
}

async function main() {
  console.log('='.repeat(60));
  console.log('  T119A: PostgreSQL Document Scale Validation');
  console.log(`  Target: ${DOCUMENT_COUNT} documents, < 200ms query time`);
  console.log('='.repeat(60));

  try {
    const ownerIds = await createTestUsers();
    await createTestDocuments(ownerIds);
    await checkIndexes();

    // Test queries with a sample user
    if (ownerIds.length > 0) {
      await testDocumentListQuery(ownerIds[0]);
    }

    const success = await printSummary();

    // Note: Don't cleanup automatically - keep data for other tests
    // await cleanup();

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Error during validation:', error);
    process.exit(1);
  }
}

main();
