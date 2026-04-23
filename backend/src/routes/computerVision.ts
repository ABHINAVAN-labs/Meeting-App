import { Router } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const analyzeVideoSchema = z.object({
  meetingId: z.string().uuid(),
  videoUrl: z.string().url(),
});

router.post('/analyze', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const data = analyzeVideoSchema.parse(req.body);
    const { meetingId, videoUrl } = data;
    
    // Verify user has access to this meeting
    const meetingResult = await pool.query(
      'SELECT * FROM meetings WHERE id = $1',
      [meetingId]
    );
    
    if (meetingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    
    const meeting = meetingResult.rows[0];
    const hasAccess = meeting.participants.includes(req.user.id) || meeting.created_by === req.user.id;
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this meeting' });
    }
    
    const analysis = {
      meetingId,
      videoUrl,
      status: 'processing' as const,
      results: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    
    const result = await pool.query(
      `INSERT INTO cv_analyses (meeting_id, "videoUrl", status, results, "startedAt", "completedAt")
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [analysis.meetingId, analysis.videoUrl, analysis.status, null, analysis.startedAt, analysis.completedAt]
    );
    
    res.status(201).json({
      id: result.rows[0].id,
      status: 'processing',
      message: 'Analysis started. Poll for results.',
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('CV analysis error:', error);
    res.status(500).json({ error: 'Failed to start analysis' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { rows } = await pool.query(
      `SELECT cv.* FROM cv_analyses cv
       JOIN meetings m ON cv.meeting_id = m.id
       WHERE cv.id = $1 AND (m.created_by = $2 OR $2 = ANY(m.participants))`,
      [req.params.id, req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found or access denied' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Get CV analysis error:', error);
    res.status(500).json({ error: 'Failed to get analysis' });
  }
});

export const cvRoutes = router;
