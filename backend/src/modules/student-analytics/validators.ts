import { z } from 'zod';

const uuidSchema = z.uuid();
const isoDateSchema = z.iso.date();
const isoDatetimeSchema = z.iso.datetime();

export const createStudentEventSchema = z.object({
  studentId: uuidSchema,
  sessionId: uuidSchema.nullish(),
  eventType: z.enum([
    'question_asked',
    'interaction',
    'doubt_submitted',
    'experiment_entry',
    'career_query',
    'activity_logged',
  ]),
  eventData: z.record(z.string(), z.unknown()).default({}),
  qualityScore: z.number().min(0).max(1).nullish(),
});

export const createDailyActivitySchema = z.object({
  studentId: uuidSchema,
  loggedDate: isoDateSchema.nullish(),
  activityType: z
    .enum(['sport', 'art', 'tech', 'social', 'academic', 'civic'])
    .nullish(),
  activityName: z.string().min(1).max(255),
  role: z
    .enum(['leader', 'co-leader', 'participant', 'organizer', 'coach', 'audience'])
    .nullish(),
  durationMinutes: z.number().int().nonnegative().nullish(),
  description: z.string().max(5000).nullish(),
  moodScore: z.number().min(1).max(5).nullish(),
  llmResponses: z.array(z.record(z.string(), z.unknown())).nullish(),
  derivedTraits: z.record(z.string(), z.number().min(0).max(1)).nullish(),
});

export const createMcqSessionSchema = z.object({
  studentId: uuidSchema,
  classSessionId: uuidSchema.nullish(),
  subject: z.string().max(100).nullish(),
  topic: z.string().max(255).nullish(),
  totalQuestions: z.number().int().positive().default(20),
  maxMarks: z.number().int().positive().default(20),
  startedAt: isoDatetimeSchema,
  submittedAt: isoDatetimeSchema.nullish(),
  totalDurationMs: z.number().int().nonnegative().nullish(),
  rawScore: z.number().int().nonnegative().nullish(),
  irtAbilityScore: z.number().min(-3).max(3).nullish(),
  bloomBreakdown: z.record(z.string(), z.number()).nullish(),
});

export const createMcqResponsesSchema = z.object({
  responses: z
    .array(
      z.object({
        questionId: uuidSchema.nullish(),
        questionOrder: z.number().int().nonnegative().nullish(),
        selectedOption: z.number().int().nullish(),
        correctOption: z.number().int().nullish(),
        isCorrect: z.boolean().nullish(),
        timeTakenMs: z.number().int().nonnegative().nullish(),
        changedAnswer: z.boolean().optional(),
        changeCount: z.number().int().nonnegative().optional(),
        difficulty: z.number().min(-3).max(3).nullish(),
        discrimination: z.number().nullish(),
        bloomLevel: z
          .enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'])
          .nullish(),
      })
    )
    .min(1),
});

export const studentCardParamsSchema = z.object({
  studentId: uuidSchema,
});

export const mcqSessionParamsSchema = z.object({
  mcqSessionId: uuidSchema,
});

export type CreateStudentEventInput = z.infer<typeof createStudentEventSchema>;
export type CreateDailyActivityInput = z.infer<typeof createDailyActivitySchema>;
export type CreateMcqSessionInput = z.infer<typeof createMcqSessionSchema>;
export type CreateMcqResponsesInput = z.infer<typeof createMcqResponsesSchema>;
export type StudentCardParams = z.infer<typeof studentCardParamsSchema>;
