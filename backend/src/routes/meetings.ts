import { Router } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const createMeetingSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  participants: z.array(z.string()),
  videoUrl: z.string().url().optional(),
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const data = createMeetingSchema.parse(req.body);
    
    // Ensure creator is also a participant
    const participants = [...new Set([...data.participants, req.user.id])];
    
    const result = await pool.query(
      `INSERT INTO meetings (title, description, "startTime", "endTime", participants, "videoUrl", created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.title,
        data.description,
        data.startTime,
        data.endTime,
        JSON.stringify(participants),
        data.videoUrl,
        req.user.id
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Create meeting error:', error);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM meetings WHERE id = $1', [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    
    // Check if user has access (is participant or creator)
    if (req.user && !rows[0].participants.includes(req.user.id) && rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Get meeting error:', error);
    res.status(500).json({ error: 'Failed to get meeting' });
  }
});

router.get('/', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Return meetings where user is participant or creator
    const { rows } = await pool.query(
      `SELECT * FROM meetings 
       WHERE $1 = ANY(participants) OR created_by = $1
       ORDER BY "startTime" DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Get meetings error:', error);
    res.status(500).json({ error: 'Failed to get meetings' });
  }
});

router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { title, description, startTime, endTime, videoUrl } = req.body;
    
    const result = await pool.query(
      `UPDATE meetings 
       SET title = $1, description = $2, "startTime" = $3, "endTime" = $4, "videoUrl" = $5
       WHERE id = $6 AND (created_by = $7 OR $7 = ANY(participants))
       RETURNING *`,
      [title, description, startTime, endTime, videoUrl, req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found or access denied' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update meeting error:', error);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const result = await pool.query(
      'DELETE FROM meetings WHERE id = $1 AND created_by = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found or access denied' });
    }
    
    res.json({ message: 'Meeting deleted', meeting: result.rows[0] });
  } catch (error) {
    console.error('Delete meeting error:', error);
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

export const meetingRoutes = router;
