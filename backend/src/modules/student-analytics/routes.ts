import { Response, Router } from 'express';
import { ZodError } from 'zod';

import { authMiddleware } from '../../middleware/auth';
import {
  createDailyActivity,
  createMcqResponses,
  createMcqSession,
  createStudentEvent,
  getStudentCard,
  isForbiddenError,
  isNotFoundError,
} from './service';
import {
  createDailyActivitySchema,
  createMcqResponsesSchema,
  createMcqSessionSchema,
  createStudentEventSchema,
  mcqSessionParamsSchema,
  studentCardParamsSchema,
} from './validators';

const router = Router();

router.use(authMiddleware);

router.post('/events', async (req, res) => {
  try {
    const input = createStudentEventSchema.parse(req.body);
    const result = await createStudentEvent(req.user!.id, input);
    res.status(201).json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.post('/daily-activities', async (req, res) => {
  try {
    const input = createDailyActivitySchema.parse(req.body);
    const result = await createDailyActivity(req.user!.id, input);
    res.status(201).json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.post('/mcq-sessions', async (req, res) => {
  try {
    const input = createMcqSessionSchema.parse(req.body);
    const result = await createMcqSession(req.user!.id, input);
    res.status(201).json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.post('/mcq-sessions/:mcqSessionId/responses', async (req, res) => {
  try {
    const { mcqSessionId } = mcqSessionParamsSchema.parse(req.params);
    const input = createMcqResponsesSchema.parse(req.body);
    const result = await createMcqResponses(req.user!.id, mcqSessionId, input);
    res.status(201).json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.get('/students/:studentId/card', async (req, res) => {
  try {
    const { studentId } = studentCardParamsSchema.parse(req.params);
    const result = await getStudentCard(req.user!.id, studentId);
    res.json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
});

function handleRouteError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Invalid request payload',
      details: error.issues,
    });
    return;
  }

  if (isForbiddenError(error)) {
    res.status(403).json({ error: error.message });
    return;
  }

  if (isNotFoundError(error)) {
    res.status(404).json({ error: error.message });
    return;
  }

  console.error('Student analytics route error:', error);
  res.status(500).json({ error: 'Internal server error' });
}

export default router;
