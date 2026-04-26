import express from 'express';
import cors from 'cors';

import { envPath } from './env';
import { pool, supabaseAuthClient } from './database';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});



app.listen(PORT, async () => {
  console.log(`Backend server running on port ${PORT}`);

  try {
    // Prefer a short-lived connection check instead of holding one open
    const client = await pool.connect();
    client.release();

    console.log('Connected to Supabase PostgreSQL');

    // sanity check for Supabase auth client
    await supabaseAuthClient.auth.getUser('test');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('JWT verification failed')
    ) {
      console.log('Supabase auth client initialized');
    } else {
      console.error('Startup error:', error);
      console.error(`Loaded backend environment from ${envPath}`);
    }
  }
});

export default app;
