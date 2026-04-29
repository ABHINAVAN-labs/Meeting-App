"use client";

import { backendRequest } from "@/lib/backendApi";

export type StudentEventType =
  | "question_asked"
  | "interaction"
  | "doubt_submitted"
  | "experiment_entry"
  | "career_query"
  | "activity_logged";

export type DailyActivityType =
  | "sport"
  | "art"
  | "tech"
  | "social"
  | "academic"
  | "civic";

export type DailyActivityRole =
  | "leader"
  | "co-leader"
  | "participant"
  | "organizer"
  | "coach"
  | "audience";

export type StudentCardPayload = {
  profile: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    role: "student" | "teacher" | "admin" | null;
    grade: string | null;
    section: string | null;
    academicFocus: string | null;
    institutionName: string | null;
    headline: string | null;
  };
  snapshot: Record<string, unknown> | null;
  recentActivityBadges: string[];
};

export async function createStudentEvent(input: {
  studentId: string;
  sessionId?: string | null;
  eventType: StudentEventType;
  eventData: Record<string, unknown>;
  qualityScore?: number | null;
}) {
  return backendRequest<{ id: string }>("/student-analytics/events", {
    method: "POST",
    body: input,
  });
}

export async function createDailyActivity(input: {
  studentId: string;
  loggedDate?: string | null;
  activityType?: DailyActivityType | null;
  activityName: string;
  role?: DailyActivityRole | null;
  durationMinutes?: number | null;
  description?: string | null;
  moodScore?: number | null;
  llmResponses?: Array<Record<string, unknown>>;
  derivedTraits?: Record<string, number>;
}) {
  return backendRequest<{ id: string }>("/student-analytics/daily-activities", {
    method: "POST",
    body: input,
  });
}

export async function getStudentCard(studentId: string) {
  return backendRequest<StudentCardPayload>(
    `/student-analytics/students/${studentId}/card`
  );
}
