import { Router } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const generateInsightSchema = z.object({
  meetingId: z.string().uuid(),
  factors: z.object({
    communicationStyle: z.enum(['direct', 'indirect', 'collaborative', 'analytical']).optional(),
    goals: z.array(z.string()).optional(),
    preferences: z.record(z.string(), z.any()).optional(),
  }).optional(),
});

router.post('/generate', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const data = generateInsightSchema.parse(req.body);
    const { meetingId, factors } = data;
    
    const meetingResult = await pool.query(
      'SELECT * FROM meetings WHERE id = $1',
      [meetingId]
    );
    
    if (meetingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    
    const meeting = meetingResult.rows[0];
    
    // Check if user has access to this meeting
    const hasAccess = meeting.participants.includes(req.user.id) || meeting.created_by === req.user.id;
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this meeting' });
    }
    
    // For now, create a placeholder insight (LLM integration will go here)
    const insight = {
      meetingId,
      userId: req.user.id,
      summary: `Meeting summary for ${meeting.title}`,
      keyPoints: [],
      actionItems: [],
      sentiment: 'neutral' as const,
      factors: factors || {},
    };
    
    const result = await pool.query(
      `INSERT INTO insights (meeting_id, user_id, summary, "keyPoints", "actionItems", sentiment, factors)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        insight.meetingId,
        insight.userId,
        insight.summary,
        JSON.stringify(insight.keyPoints),
        JSON.stringify(insight.actionItems),
        insight.sentiment,
        JSON.stringify(insight.factors),
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Generate insight error:', error);
    res.status(500).json({ error: 'Failed to generate insight' });
  }
});

router.get('/user/:userId', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Users can only access their own insights
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const { rows } = await pool.query(
      'SELECT * FROM insights WHERE user_id = $1 ORDER BY "createdAt" DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Get user insights error:', error);
    res.status(500).json({ error: 'Failed to get insights' });
  }
});

export const insightsRoutes = router;
