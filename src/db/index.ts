import 'dotenv/config';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client'; // Recommended for LibSQL
import * as schema from './schema';

// Create the client explicitly
const client = createClient({ 
  url: process.env.DB_FILE_NAME! 
});

// Pass the schema in the config object
export const db = drizzle(client, { schema });