import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool, supabaseAuthClient } from './database';
import { authMiddleware, AuthRequest } from './middleware/auth';
import { meetingRoutes } from './routes/meetings';
import { insightsRoutes } from './routes/insights';
import { cvRoutes } from './routes/computerVision';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/meetings', authMiddleware, meetingRoutes);
app.use('/api/insights', authMiddleware, insightsRoutes);
app.use('/api/cv', authMiddleware, cvRoutes);

app.listen(PORT, async () => {
  console.log(`Backend server running on port ${PORT}`);

  try {
    await pool.connect();
    console.log('Connected to Supabase PostgreSQL');

    await supabaseAuthClient.auth.getUser('test');
  } catch (error) {
    if (error instanceof Error && error.message.includes('JWT verification failed')) {
      console.log('Supabase auth client initialized');
    } else {
      console.error('Database connection error:', error);
    }
  }
});

export default app;
export type { AuthRequest };
