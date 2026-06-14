import argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import { logger } from './logger.js';

/**
 * Unified password hashing and verification.
 *
 * All NEW passwords are hashed with argon2id.
 * Legacy bcrypt hashes (prefix $2a$ / $2b$) are still verified and
 * transparently upgraded to argon2 on successful authentication.
 *
 * Once all active users have argon2 hashes, bcryptjs can be removed.
 */

const BCRYPT_PREFIX_RE = /^\$2[ab]\$/;

/** Hash a PBKDF2-prehashed password for storage (always argon2id). */
export async function hashPassword(phc: string): Promise<string> {
  return argon2.hash(phc, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a PBKDF2-prehashed password against a stored hash.
 *
 * Tries argon2 first.  If that fails and the stored hash looks like a
 * legacy bcrypt hash, falls back to bcrypt.  On a successful bcrypt
 * match the caller receives `needsRehash: true` so it can upgrade
 * the stored hash to argon2.
 */
export async function verifyPassword(
  phc: string,
  storedHash: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  // Fast path: argon2
  try {
    const valid = await argon2.verify(storedHash, phc);
    if (valid) return { valid: true, needsRehash: false };
  } catch {
    // argon2.verify throws on malformed hashes — fall through
  }

  // Legacy path: bcrypt
  if (BCRYPT_PREFIX_RE.test(storedHash)) {
    try {
      const valid = await bcrypt.compare(phc, storedHash);
      if (valid) {
        logger.info('password: legacy bcrypt hash verified — upgrade recommended', {
          hashPrefix: storedHash.slice(0, 7),
        });
        return { valid: true, needsRehash: true };
      }
    } catch (err) {
      logger.warn('password: bcrypt comparison error', { error: String(err) });
    }
  }

  return { valid: false, needsRehash: false };
}

/**
 * Quick check whether a stored hash is still bcrypt (not yet upgraded).
 * Useful for audit queries.
 */
export function isLegacyHash(storedHash: string): boolean {
  return BCRYPT_PREFIX_RE.test(storedHash);
}
