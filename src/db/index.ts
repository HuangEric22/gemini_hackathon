import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { getDatabaseConfig } from '@/lib/env';
import * as schema from './schema';

const client = createClient(getDatabaseConfig());

export const db = drizzle(client, { schema });

export async function ensureDbSchema() {
  // Schema changes are applied with Drizzle migrations before the app runs.
  // This compatibility wrapper keeps existing server actions stable.
}
