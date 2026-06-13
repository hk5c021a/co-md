/**
 * T119D: Contact Search Performance Validation
 *
 * Requirements:
 * - Use 10,000 user dataset
 * - Verify search response < 2 seconds
 *
 * Run: pnpm --filter backend exec tsx tests/performance/t119d-contact-search.ts
 */

import { db } from '../../src/db/index.js';
import { users, contacts } from '../../src/db/schema.js';
import { sql, eq, inArray, like, or, and, not } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const TARGET_USER_COUNT = 10000;
const TARGET_LATENCY_MS = 2000;
const BATCH_SIZE = 1000;

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  expected: string;
  actual: string;
}

const results: TestResult[] = [];
let testUserId: string;
const createdUserIds: string[] = [];

async function setupTestUser() {
  console.log('Creating test user...');
  testUserId = randomUUID();

  await db.insert(users).values({
    id: testUserId,
    username: `contactsearch_user_${Date.now()}`,
    email: `contactsearch_${Date.now()}@example.com`,
    phone: `+861${String(Date.now()).slice(-4)}${'0'.repeat(7)}`.slice(0, 15),
    passwordHash: 'hashedpassword12345678901234567890',
  });

  console.log(`  Created test user: ${testUserId}`);
  return testUserId;
}

async function createTestUsers() {
  console.log(`Creating ${TARGET_USER_COUNT} test users in batches of ${BATCH_SIZE}...`);
  const start = Date.now();

  for (let batch = 0; batch < TARGET_USER_COUNT / BATCH_SIZE; batch++) {
    const batchValues: typeof users.$inferInsert[] = [];
    const batchStart = batch * BATCH_SIZE;
    const ts = Date.now();

    for (let i = 0; i < BATCH_SIZE; i++) {
      const index = batchStart + i;
      const userId = randomUUID();
      createdUserIds.push(userId);
      batchValues.push({
        id: userId,
        username: `searchuser_${index}_${ts}`,
        email: `searchuser_${index}_${ts}@example.com`,
        phone: `+861${String(ts).slice(-4)}${String(index).padStart(7, '0')}`.slice(0, 15),
        passwordHash: 'hashedpassword12345678901234567890',
      });
    }

    await db.insert(users).values(batchValues);

    const progress = Math.round(((batch + 1) / (TARGET_USER_COUNT / BATCH_SIZE)) * 100);
    console.log(`  Batch ${batch + 1}/${TARGET_USER_COUNT / BATCH_SIZE} - ${progress}%`);
  }

  const duration = Date.now() - start;
  results.push({
    name: `Create ${TARGET_USER_COUNT} users`,
    passed: createdUserIds.length === TARGET_USER_COUNT,
    duration,
    expected: `${TARGET_USER_COUNT} users`,
    actual: `${createdUserIds.length} users in ${duration}ms`,
  });

  console.log(`  Created ${createdUserIds.length} users in ${duration}ms`);
}

async function createContactRelationships() {
  console.log('\nCreating contact relationships...');
  const start = Date.now();

  // Create contacts for the test user using Drizzle ORM
  const contactBatchSize = 100;
  const contactUserIds = createdUserIds.slice(0, contactBatchSize);

  await db.insert(contacts).values(
    contactUserIds.map((userId) => ({
      id: randomUUID(),
      userId: testUserId,
      contactUserId: userId,
    }))
  );

  const duration = Date.now() - start;
  results.push({
    name: 'Create contact relationships',
    passed: true,
    duration,
    expected: 'Contacts created',
    actual: `${contactUserIds.length} contacts in ${duration}ms`,
  });

  console.log(`  Created ${contactUserIds.length} contacts in ${duration}ms`);
}

async function testSearchPerformance() {
  console.log('\nTesting search performance...');

  // Test 1: Exact username search
  const searchUsername = `searchuser_5000_${Date.now()}`;
  const start1 = Date.now();

  const usernameResults = await db.execute(sql`
    SELECT id, username, email, phone
    FROM users
    WHERE username = ${searchUsername}
    LIMIT 20
  `);
  const duration1 = Date.now() - start1;

  results.push({
    name: 'Exact username search',
    passed: duration1 < TARGET_LATENCY_MS,
    duration: duration1,
    expected: `< ${TARGET_LATENCY_MS}ms`,
    actual: `${duration1}ms (${usernameResults.length} results)`,
  });
  console.log(`  Exact username search: ${duration1}ms`);

  // Test 2: Username prefix search (LIKE prefix%)
  const start2 = Date.now();

  const prefixResults = await db.execute(sql`
    SELECT id, username, email, phone
    FROM users
    WHERE username LIKE 'searchuser_5%'
    LIMIT 20
  `);
  const duration2 = Date.now() - start2;

  results.push({
    name: 'Username prefix search',
    passed: duration2 < TARGET_LATENCY_MS,
    duration: duration2,
    expected: `< ${TARGET_LATENCY_MS}ms`,
    actual: `${duration2}ms (${prefixResults.length} results)`,
  });
  console.log(`  Username prefix search: ${duration2}ms`);

  // Test 3: General username search (LIKE %pattern%)
  const start3 = Date.now();

  const generalResults = await db.execute(sql`
    SELECT id, username, email, phone
    FROM users
    WHERE username LIKE '%searchuser_5%'
    LIMIT 20
  `);
  const duration3 = Date.now() - start3;

  results.push({
    name: 'Username general search',
    passed: duration3 < TARGET_LATENCY_MS,
    duration: duration3,
    expected: `< ${TARGET_LATENCY_MS}ms`,
    actual: `${duration3}ms (${generalResults.length} results)`,
  });
  console.log(`  Username general search: ${duration3}ms`);

  // Test 4: Email search
  const start4 = Date.now();

  const emailResults = await db.execute(sql`
    SELECT id, username, email, phone
    FROM users
    WHERE email LIKE '%searchuser_5%@example.com'
    LIMIT 20
  `);
  const duration4 = Date.now() - start4;

  results.push({
    name: 'Email search',
    passed: duration4 < TARGET_LATENCY_MS,
    duration: duration4,
    expected: `< ${TARGET_LATENCY_MS}ms`,
    actual: `${duration4}ms (${emailResults.length} results)`,
  });
  console.log(`  Email search: ${duration4}ms`);

  // Test 5: Phone search
  const start5 = Date.now();

  const phonePattern = '100050000';
  const phoneResults = await db
    .select({ id: users.id, username: users.username, email: users.email, phone: users.phone })
    .from(users)
    .where(like(users.phone, `%${phonePattern}%`))
    .limit(20);
  const duration5 = Date.now() - start5;

  results.push({
    name: 'Phone search',
    passed: duration5 < TARGET_LATENCY_MS,
    duration: duration5,
    expected: `< ${TARGET_LATENCY_MS}ms`,
    actual: `${duration5}ms (${phoneResults.length} results)`,
  });
  console.log(`  Phone search: ${duration5}ms`);

  // Test 6: Combined search (search across all fields)
  const start6 = Date.now();

  const combinedResults = await db
    .select({ id: users.id, username: users.username, email: users.email, phone: users.phone })
    .from(users)
    .where(
      or(
        like(users.username, '%5000%'),
        like(users.email, '%5000%'),
        like(users.phone, '%5000%')
      )
    )
    .limit(20);
  const duration6 = Date.now() - start6;

  results.push({
    name: 'Combined field search',
    passed: duration6 < TARGET_LATENCY_MS,
    duration: duration6,
    expected: `< ${TARGET_LATENCY_MS}ms`,
    actual: `${duration6}ms (${combinedResults.length} results)`,
  });
  console.log(`  Combined search: ${duration6}ms`);
}

async function testContactSearchIntegration() {
  console.log('\nTesting contact-specific search...');

  // Test: Search users excluding existing contacts (add contact flow)
  const start1 = Date.now();

  const nonContactResults = await db
    .select({ id: users.id, username: users.username, email: users.email, phone: users.phone })
    .from(users)
    .where(
      and(
        not(eq(users.id, testUserId)),
        not(inArray(users.id, db.select({ contactUserId: contacts.contactUserId }).from(contacts).where(eq(contacts.userId, testUserId)))),
        or(like(users.username, '%searchuser%'), like(users.email, '%searchuser%'), like(users.phone, '%searchuser%'))
      )
    )
    .limit(20);
  const duration1 = Date.now() - start1;

  results.push({
    name: 'Contact search (exclude existing)',
    passed: duration1 < TARGET_LATENCY_MS,
    duration: duration1,
    expected: `< ${TARGET_LATENCY_MS}ms`,
    actual: `${duration1}ms (${nonContactResults.length} results)`,
  });
  console.log(`  Contact search: ${duration1}ms`);

  // Test: Search existing contacts
  const start2 = Date.now();

  const existingContactResults = await db
    .select({ id: users.id, username: users.username, email: users.email, phone: users.phone })
    .from(users)
    .innerJoin(contacts, eq(users.id, contacts.contactUserId))
    .where(
      and(
        eq(contacts.userId, testUserId),
        or(like(users.username, '%searchuser%'), like(users.email, '%searchuser%'), like(users.phone, '%searchuser%'))
      )
    )
    .limit(20);
  const duration2 = Date.now() - start2;

  results.push({
    name: 'Search existing contacts',
    passed: duration2 < TARGET_LATENCY_MS,
    duration: duration2,
    expected: `< ${TARGET_LATENCY_MS}ms`,
    actual: `${duration2}ms (${existingContactResults.length} results)`,
  });
  console.log(`  Existing contact search: ${duration2}ms`);
}

async function checkIndexes() {
  console.log('\nChecking search-related indexes...');

  const indexes = await db.execute(sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'users'
      AND indexname IN ('users_username_unique', 'users_email_unique', 'users_phone_unique')
  `);

  const indexNames = indexes.map((idx: { indexname: string }) => idx.indexname);

  results.push({
    name: 'Check search indexes',
    passed: indexNames.length >= 3, // UNIQUE constraints on username+email+phone
    duration: 0,
    expected: 'username, email, phone indexes',
    actual: indexNames.join(', ') || 'No indexes found',
  });

  console.log(`  Found indexes: ${indexNames.join(', ') || 'None'}`);
}

async function cleanup() {
  console.log('\nCleaning up test data...');

  // Clean up test data using Drizzle ORM
  await db.delete(contacts).where(eq(contacts.userId, testUserId));

  for (let i = 0; i < createdUserIds.length; i += BATCH_SIZE) {
    const batch = createdUserIds.slice(i, i + BATCH_SIZE);
    await db.delete(users).where(inArray(users.id, batch));
  }

  await db.delete(users).where(eq(users.id, testUserId));

  console.log('  Cleanup complete');
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('  T119D PERFORMANCE VALIDATION SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} | ${result.name}`);
    console.log(`       Expected: ${result.expected}`);
    console.log(
      `       Actual:   ${result.actual}${result.duration > 0 ? ` (${result.duration}ms)` : ''}`
    );
  }

  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  return failed === 0;
}

async function main() {
  console.log('='.repeat(60));
  console.log('  T119D: Contact Search Performance Validation');
  console.log(`  Target: ${TARGET_USER_COUNT} users, < ${TARGET_LATENCY_MS}ms latency`);
  console.log('='.repeat(60));

  try {
    await setupTestUser();
    await createTestUsers();
    await createContactRelationships();
    await checkIndexes();
    await testSearchPerformance();
    await testContactSearchIntegration();

    const success = await printSummary();

    // await cleanup();

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Error during validation:', error);
    process.exit(1);
  }
}

main();
