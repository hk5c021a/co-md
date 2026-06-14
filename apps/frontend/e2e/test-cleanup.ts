/**
 * Cross-run E2E test data cleanup.
 *
 * Problem: When E2E tests run multiple times, leftover test users/documents
 * from previous runs cause username collisions, token conflicts, and document
 * permission failures. Per-test cleanup via API fixtures can't handle
 * cross-run residue, especially orphaned sessions from crashed tests.
 *
 * Solution: Direct DB cleanup via Docker Postgres. Deletes all test users
 * (matched by naming patterns) and cascades to documents/permissions/sessions.
 * Called from both global-setup (fresh start) and global-teardown (clean exit).
 */

import { spawnSync } from 'node:child_process';

/** All naming patterns use hardcoded literal strings — no user input interpolated. */
const TEST_USER_PATTERNS: readonly string[] = [
  'e2e_%',
  'systest_%',
  'ratetest_%',
  'perfuser_%',
  'searchuser_%',
  'contactsearch_%',
  'migtest_%',
  'wstest_%',
];

function runPsql(container: string, user: string, db: string, sql: string): string {
  const result = spawnSync(
    'docker',
    ['exec', container, 'psql', '-U', user, '-d', db, '-c', sql],
    { timeout: 10_000, encoding: 'utf-8' }
  );
  if (result.error) throw result.error;
  return result.stdout + result.stderr;
}

/**
 * Delete all test users from the database.
 * Cascades to documents, permissions, sessions, notifications, contacts
 * (ON DELETE CASCADE on FK constraints).
 */
export async function cleanupTestData(): Promise<void> {
  const container = process.env.E2E_DB_CONTAINER || 'collab_postgres';
  const db = process.env.E2E_DB_NAME || 'collab_db';
  const user = process.env.E2E_DB_USER || 'postgres';

  let deleted = 0;
  for (const pattern of TEST_USER_PATTERNS) {
    try {
      const output = runPsql(container, user, db, `DELETE FROM users WHERE username LIKE '${pattern}';`);
      const match = output.match(/DELETE\s+(\d+)/i);
      if (match) deleted += parseInt(match[1], 10);
    } catch {
      // Container or DB might not be available — skip
    }
  }

  if (deleted > 0) {
    console.log(`[test-cleanup] Deleted ${deleted} test users (and cascaded data)`);
  }
}
