import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { logger } from '../lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dedicated migration client — max:1 avoids postgres.js implicit transactions
// that would block CREATE INDEX CONCURRENTLY.
function getMigrationClient() {
  return postgres(process.env.DATABASE_URL!, { max: 1 });
}
const MIGRATIONS_DIR = resolve(__dirname, '../../drizzle');

function getMigrationFiles(): { name: string; path: string }[] {
  const files = readdirSync(MIGRATIONS_DIR).filter(
    (f) => f.endsWith('.sql') && !f.startsWith('meta')
  );
  // Sort by migration number prefix (e.g., 0000_, 0001_, ...)
  files.sort((a, b) => {
    const numA = parseInt(a.split('_')[0], 10) || 0;
    const numB = parseInt(b.split('_')[0], 10) || 0;
    return numA - numB;
  });
  return files.map((f) => ({ name: f, path: resolve(MIGRATIONS_DIR, f) }));
}

export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  // Dedicated max:1 client avoids postgres.js implicit transactions
  const migClient = getMigrationClient();
  try {
    await migClient.unsafe(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    const files = getMigrationFiles();
    const existing = await migClient.unsafe<{ name: string }[]>(`SELECT name FROM _migrations`);
    const applied = new Set(existing.map((r) => r.name));

    const appliedNow: string[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      if (applied.has(file.name)) {
        skipped.push(file.name);
        continue;
      }

      const sql = readFileSync(file.path, 'utf-8');
      try {
        // Split multi-statement SQL on Drizzle Kit's statement-breakpoint separator.
        const statements = sql
          .split(/-->\s*statement-breakpoint\s*/i)
          .map(s => s.trim())
          .filter(Boolean);

        for (const stmt of statements) {
          await migClient.unsafe(stmt);
        }
        await migClient.unsafe(`INSERT INTO _migrations (name) VALUES ($1)`, [file.name]);
        appliedNow.push(file.name);
        logger.info(`Migration applied: ${file.name}`);
      } catch (err) {
      logger.error(`Migration failed: ${file.name}`, err);
      break; // Stop on first failure to preserve ordering
    }
  }

  return { applied: appliedNow, skipped };
  } finally {
    await migClient.end();
  }
}

// Allow running directly: tsx src/db/migrate.ts
if (process.argv[1]?.endsWith('migrate.js') || process.argv[1]?.endsWith('migrate.ts')) {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    logger.info('Running migrations...');
  }
  runMigrations()
    .then(({ applied, skipped }) => {
      if (applied.length > 0) {
        logger.info(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
      }
      if (skipped.length > 0) {
        logger.info(`Skipped ${skipped.length} already-applied migration(s)`);
      }
      if (applied.length === 0 && skipped.length === 0) {
        logger.info('No migration files found');
      }
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Migration run failed', err);
      process.exit(1);
    });
}
