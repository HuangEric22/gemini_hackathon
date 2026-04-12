import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

const client = createClient({
  url: process.env.DB_FILE_NAME!,
  authToken: process.env.DB_AUTH_TOKEN, // only needed for Turso — ignored for local file
});

export const db = drizzle(client, { schema });
