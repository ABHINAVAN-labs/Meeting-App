import type { Pool, PoolClient } from 'pg';

import { pool } from '../../database';
import type {
  CreateDailyActivityInput,
  CreateMcqResponsesInput,
  CreateMcqSessionInput,
  CreateStudentEventInput,
} from './validators';
import type { ProfileRole, StudentAnalyticsProfile, StudentCardResponse } from './types';

type DbProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: ProfileRole | null;
  grade: string | null;
  section: string | null;
  academic_focus: string | null;
  institution_name: string | null;
  bio: string | null;
};

class ForbiddenError extends Error {}
class NotFoundError extends Error {}

function mapProfile(row: DbProfileRow): StudentAnalyticsProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    grade: row.grade,
    section: row.section,
    academicFocus: row.academic_focus,
    institutionName: row.institution_name,
    bio: row.bio,
  };
}

async function getProfileById(
  profileId: string,
  client: Pick<Pool, 'query'> | Pick<PoolClient, 'query'> = pool
): Promise<StudentAnalyticsProfile> {
  const result = await client.query<DbProfileRow>(
    `
      SELECT
        id,
        email,
        display_name,
        avatar_url,
        role,
        grade,
        section,
        academic_focus,
        institution_name,
        bio
      FROM profiles
      WHERE id = $1
    `,
    [profileId]
  );

  if (result.rowCount === 0) {
    throw new NotFoundError('Profile not found');
  }

  return mapProfile(result.rows[0]);
}

function assertCanWriteStudentData(
  actor: StudentAnalyticsProfile,
  targetStudentId: string
) {
  if (actor.role === 'teacher' || actor.role === 'admin') {
    return;
  }

  if (actor.id !== targetStudentId) {
    throw new ForbiddenError('You can only write your own analytics data');
  }
}

function assertCanReadStudentCard(
  actor: StudentAnalyticsProfile,
  targetStudentId: string
) {
  if (actor.role === 'teacher' || actor.role === 'admin') {
    return;
  }

  if (actor.id !== targetStudentId) {
    throw new ForbiddenError('You can only read your own student card');
  }
}

export async function createStudentEvent(
  actorId: string,
  input: CreateStudentEventInput
) {
  const actor = await getProfileById(actorId);
  assertCanWriteStudentData(actor, input.studentId);

  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO student_events (
        student_id,
        session_id,
        event_type,
        event_data,
        quality_score
      )
      VALUES ($1, $2, $3, $4::jsonb, $5)
      RETURNING id
    `,
    [
      input.studentId,
      input.sessionId ?? null,
      input.eventType,
      JSON.stringify(input.eventData ?? {}),
      input.qualityScore ?? null,
    ]
  );

  return result.rows[0];
}

export async function createDailyActivity(
  actorId: string,
  input: CreateDailyActivityInput
) {
  const actor = await getProfileById(actorId);
  assertCanWriteStudentData(actor, input.studentId);

  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO daily_activities (
        student_id,
        logged_date,
        activity_type,
        activity_name,
        role,
        duration_minutes,
        description,
        mood_score,
        llm_responses,
        derived_traits
      )
      VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
      RETURNING id
    `,
    [
      input.studentId,
      input.loggedDate ?? null,
      input.activityType ?? null,
      input.activityName,
      input.role ?? null,
      input.durationMinutes ?? null,
      input.description ?? null,
      input.moodScore ?? null,
      JSON.stringify(input.llmResponses ?? []),
      JSON.stringify(input.derivedTraits ?? {}),
    ]
  );

  return result.rows[0];
}

export async function createMcqSession(
  actorId: string,
  input: CreateMcqSessionInput
) {
  const actor = await getProfileById(actorId);
  assertCanWriteStudentData(actor, input.studentId);

  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO mcq_sessions (
        student_id,
        class_session_id,
        subject,
        topic,
        total_questions,
        max_marks,
        started_at,
        submitted_at,
        total_duration_ms,
        raw_score,
        irt_ability_score,
        bloom_breakdown
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      RETURNING id
    `,
    [
      input.studentId,
      input.classSessionId ?? null,
      input.subject ?? null,
      input.topic ?? null,
      input.totalQuestions,
      input.maxMarks,
      input.startedAt,
      input.submittedAt ?? null,
      input.totalDurationMs ?? null,
      input.rawScore ?? null,
      input.irtAbilityScore ?? null,
      JSON.stringify(input.bloomBreakdown ?? {}),
    ]
  );

  return result.rows[0];
}

export async function createMcqResponses(
  actorId: string,
  mcqSessionId: string,
  input: CreateMcqResponsesInput
) {
  const actor = await getProfileById(actorId);
  const sessionResult = await pool.query<{ student_id: string }>(
    `
      SELECT student_id
      FROM mcq_sessions
      WHERE id = $1
    `,
    [mcqSessionId]
  );

  if (sessionResult.rowCount === 0) {
    throw new NotFoundError('MCQ session not found');
  }

  assertCanWriteStudentData(actor, sessionResult.rows[0].student_id);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const insertedIds: string[] = [];

    for (const response of input.responses) {
      const insertResult = await client.query<{ id: string }>(
        `
          INSERT INTO mcq_responses (
            mcq_session_id,
            question_id,
            question_order,
            selected_option,
            correct_option,
            is_correct,
            time_taken_ms,
            changed_answer,
            change_count,
            difficulty,
            discrimination,
            bloom_level
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `,
        [
          mcqSessionId,
          response.questionId ?? null,
          response.questionOrder ?? null,
          response.selectedOption ?? null,
          response.correctOption ?? null,
          response.isCorrect ?? null,
          response.timeTakenMs ?? null,
          response.changedAnswer ?? false,
          response.changeCount ?? 0,
          response.difficulty ?? null,
          response.discrimination ?? null,
          response.bloomLevel ?? null,
        ]
      );

      insertedIds.push(insertResult.rows[0].id);
    }

    await client.query('COMMIT');

    return { insertedCount: insertedIds.length, ids: insertedIds };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getStudentCard(
  actorId: string,
  studentId: string
): Promise<StudentCardResponse> {
  const actor = await getProfileById(actorId);
  assertCanReadStudentCard(actor, studentId);

  const profile = await getProfileById(studentId);

  const snapshotResult = await pool.query<Record<string, unknown>>(
    `
      SELECT *
      FROM student_current_stats
      WHERE student_id = $1
      LIMIT 1
    `,
    [studentId]
  );

  const activityResult = await pool.query<{ badge: string }>(
    `
      SELECT DISTINCT activity_name AS badge
      FROM daily_activities
      WHERE student_id = $1
        AND activity_name IS NOT NULL
      ORDER BY badge
      LIMIT 4
    `,
    [studentId]
  );

  return {
    profile,
    snapshot: snapshotResult.rows[0] ?? null,
    recentActivityBadges: activityResult.rows.map((row) => row.badge),
  };
}

export function isForbiddenError(error: unknown): error is ForbiddenError {
  return error instanceof ForbiddenError;
}

export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}
