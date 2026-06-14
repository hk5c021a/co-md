import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL!;

const isProd = process.env.NODE_ENV === 'production';

const client = postgres(connectionString, {
  max: isProd ? 20 : 10,
  idle_timeout: 30,
  max_lifetime: 60 * 30,
  connection: {
    application_name: 'collab-backend',
  },
});
export const db = drizzle(client, { schema });
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function checkConnection(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
