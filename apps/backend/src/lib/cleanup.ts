import { sessionRepository, invitationRepository } from '../repositories/index.js';
import { db } from '../db/index.js';
import { passwordResetTokens } from '../db/schema.js';
import { lte, inArray } from 'drizzle-orm';
import { logger } from './logger.js';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // every hour
const CHUNK_SIZE = 1000; // Delete in batches to avoid long-lived locks

/**
 * Chunked delete helper — deletes in batches of CHUNK_SIZE to avoid
 * holding ACCESS EXCLUSIVE locks for extended periods on large tables.
 *
 * Uses subquery approach because drizzle-orm 0.45.2 DELETE does not support .limit().
 * SELECT ids first (with limit), then DELETE WHERE id IN (...).
 */
async function chunkedDelete(
  table: typeof passwordResetTokens,
  where: ReturnType<typeof lte>,
  label: string
): Promise<number> {
  let total = 0;
  let ids: { id: string }[];
  do {
    ids = await db.select({ id: table.id }).from(table).where(where).limit(CHUNK_SIZE);
    if (ids.length > 0) {
      await db.delete(table).where(inArray(table.id, ids.map(r => r.id)));
      total += ids.length;
    }
  } while (ids.length === CHUNK_SIZE);
  if (total > 0) logger.info(`Cleanup: removed ${total} ${label}`);
  return total;
}

/**
 * Run periodic cleanup of expired database records.
 * Called once at startup and then every CLEANUP_INTERVAL_MS.
 */
export async function runCleanup(): Promise<void> {
  try {
    const expiredSessions = await sessionRepository.deleteExpired();
    const expiredInvitations = await invitationRepository.deleteExpired();
    // Password reset tokens: chunked delete of expired (not consumed) tokens
    const expiredTokens = await chunkedDelete(
      passwordResetTokens,
      lte(passwordResetTokens.expiresAt, new Date()),
      'password reset tokens'
    );

    const total = expiredSessions + expiredInvitations + expiredTokens;
    if (total > 0) {
      logger.info(`Cleanup: removed ${expiredSessions} sessions, ${expiredInvitations} invitations, ${expiredTokens} password reset tokens`);
    }
  } catch (err) {
    logger.error('Periodic cleanup failed', err);
  }
}

export function startPeriodicCleanup(): void {
  runCleanup().catch((err) => logger.error('Periodic cleanup init failed', err));
  setInterval(
    () => runCleanup().catch((err) => logger.error('Periodic cleanup iteration failed', err)),
    CLEANUP_INTERVAL_MS
  );
}
