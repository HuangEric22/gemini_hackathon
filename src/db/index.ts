import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

const client = createClient({
  url: process.env.DB_FILE_NAME!,
  authToken: process.env.DB_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });

async function initSchema() {
  // Ensure users table exists
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clerk_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      name TEXT,
      image_url TEXT
    )
  `);

  // Ensure trips.image_url column exists (added after initial schema)
  const tripsInfo = await client.execute("PRAGMA table_info(`trips`)");
  const cols = tripsInfo.rows.map((r) => r.name as string);

  if (!cols.includes('image_url')) {
    await client.execute("ALTER TABLE `trips` ADD COLUMN `image_url` text").catch((e) => {
      if (!(e instanceof Error && e.message.includes('duplicate column name'))) throw e;
    });
  }

  if (!cols.includes('user_id')) {
    await client.execute("ALTER TABLE `trips` ADD COLUMN `user_id` text").catch((e) => {
      if (!(e instanceof Error && e.message.includes('duplicate column name'))) throw e;
    });
  }

  await client.execute("DROP INDEX IF EXISTS `trips_trip_name_destination_unique`");
  await client.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS `trips_user_trip_name_destination_unique` ON `trips` (`user_id`, `trip_name`, `destination`)"
  );
}

const schemaReadyPromise = initSchema();

export async function ensureDbSchema() {
  await schemaReadyPromise;
}
