import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { envPath } from './env';

const databaseUrl = process.env.DATABASE_URL;
const isSupabaseDatabase = databaseUrl?.includes('supabase.com');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isSupabaseDatabase
    ? {
        rejectUnauthorized: false,
      }
    : undefined,
});

// Supabase client for token verification. A publishable key is sufficient here.
export const supabaseAuthClient = createClient(supabaseUrl!, supabaseKey!);

export const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('Connected to Supabase PostgreSQL');
    client.release();
  } catch (error) {
    console.error('Database connection error:', error);

    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOTFOUND' &&
      databaseUrl?.includes('db.')
    ) {
      console.error(
        'Hint: use the Supabase pooler connection string in DATABASE_URL for local development, not the direct db.<project-ref>.supabase.co host.'
      );
    }

    if (
      error instanceof Error &&
      'code' in error &&
      error.code === '28P01'
    ) {
      console.error(
        `Hint: PostgreSQL rejected the username/password from ${envPath}. Re-copy the current Supabase database password into DATABASE_URL, and URL-encode it if it contains special characters.`
      );
    }

    throw error;
  }
};
