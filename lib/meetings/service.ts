import { createHash, randomUUID } from "crypto";
import { normalizeMeetingCode, normalizeParticipantName } from "./validation";
import {
  addMeetingChatMessage,
  getMeetingChatMessages,
  getWhiteboard,
  publishEvent,
  replaceWhiteboard,
  subscribeToRoom
} from "./store";
import { getMeetingRepository } from "./repository.factory";
import type {
  AttendanceRecord,
  AttendanceState,
  AttendanceSummaryEntry,
  HostControls,
  JoinMeetingRequest,
  MeetingChatMessage,
  Participant,
  WhiteboardAction,
  WhiteboardDrawable,
  WhiteboardPoint,
  WhiteboardState
} from "./types";
import { checkIpJoinRateLimit, checkMeetingJoinRateLimit } from "../security/rateLimit";
import { ensureMeetingRegistryRecord, getMeetingRegistryRecord } from "../security/meetingRegistry";
import { generateParticipantIdentity } from "../security/identity";
import { createRejoinNonce, invalidateRejoinNonce } from "../security/rejoinToken";
import { getSecurityEnv } from "../security/env";

const meetingRepo = getMeetingRepository();
getSecurityEnv();

const WHITEBOARD_MAX_POINTS_PER_STROKE = 500;
const WHITEBOARD_MAX_DRAWABLES = 600;
const WHITEBOARD_MAX_HISTORY = 30;
const WHITEBOARD_MAX_TEXT_CHARS = 200;
const WHITEBOARD_MIN_TEXT_SIZE = 8;
const WHITEBOARD_MAX_TEXT_SIZE = 120;
const WHITEBOARD_MIN_WIDTH = 1;
const WHITEBOARD_MAX_WIDTH = 30;
const WHITEBOARD_MIN_COORD = 0;
const WHITEBOARD_MAX_COORD = 10000;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const ACTIVE_TEACHER_UNIQUE_INDEX = "uniq_active_teacher_per_meeting";
const MIN_ATTENDANCE_THRESHOLD = 1;
const MAX_ATTENDANCE_THRESHOLD = 100;

export type JoinResult =
  | { ok: true; meetingCode: string; participant: Participant; status: Participant["status"] }
  | { ok: false; message: string; status?: number };

const DEFAULT_HOST_CONTROLS: HostControls = {
  muteAllRequestId: 0,
  forceStudentCamerasOn: false,
  vivaTimeEnabled: false,
  meetingChatEnabled: false
};

function isActiveTeacherUniquenessViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const maybeError = error as { code?: string; message?: string };
  if (maybeError.code === "23505" && typeof maybeError.message === "string") {
    return maybeError.message.includes(ACTIVE_TEACHER_UNIQUE_INDEX);
  }
  return false;
}

function clampAttendanceThreshold(value: number): number {
  return Math.min(MAX_ATTENDANCE_THRESHOLD, Math.max(MIN_ATTENDANCE_THRESHOLD, Math.round(value)));
}

function createAttendanceRecord(participant: Participant): AttendanceRecord {
  return {
    participantId: participant.id,
    displayName: participant.displayName,
    role: "student",
    joinedAt: participant.joinedAt,
    activeFrom: null,
    attendedMs: 0,
    banned: false,
    lastSeenAt: participant.lastSeenAt
  };
}

function addAttendanceTime(record: AttendanceRecord, atMs: number): AttendanceRecord {
  if (!record.activeFrom || atMs <= record.activeFrom) {
    return { ...record, activeFrom: null, lastSeenAt: atMs };
  }

  return {
    ...record,
    activeFrom: null,
    attendedMs: record.attendedMs + (atMs - record.activeFrom),
    lastSeenAt: atMs
  };
}

async function ensureStudentAttendanceRecord(
  meetingCode: string,
  participant: Participant,
  activeFrom: number | null = null
): Promise<void> {
  if (participant.role !== "student") {
    return;
  }

  const attendance = await meetingRepo.getAttendanceState(meetingCode);
  const existing = attendance.records.find((record) => record.participantId === participant.id);
  const record = existing ?? createAttendanceRecord(participant);
  await meetingRepo.upsertAttendanceRecord(meetingCode, {
    ...record,
    displayName: participant.displayName,
    activeFrom: record.activeFrom ?? activeFrom,
    lastSeenAt: participant.lastSeenAt
  });
}

function buildAttendanceSummary(attendance: AttendanceState, endedAt: number): AttendanceSummaryEntry[] {
  const thresholdPercent = attendance.thresholdPercent ?? 100;
  const trackingStartedAt = attendance.trackingStartedAt ?? endedAt;
  const totalMs = Math.max(0, endedAt - trackingStartedAt);

  return attendance.records.map((record) => {
    const finalRecord = record.activeFrom ? addAttendanceTime(record, endedAt) : record;
    const attendancePercent = totalMs > 0 ? Math.min(100, Math.round((finalRecord.attendedMs / totalMs) * 100)) : 0;
    const status = finalRecord.banned ? "banned" : attendancePercent >= thresholdPercent ? "present" : "absent";
    return {
      participantId: finalRecord.participantId,
      displayName: finalRecord.displayName,
      status,
      attendancePercent,
      attendedMs: finalRecord.attendedMs
    };
  });
}

export async function joinMeeting(
  payload: JoinMeetingRequest,
  context: { ipPrefix: string; uaHash: string }
): Promise<JoinResult> {
  const meetingCode = normalizeMeetingCode(payload.meetingCode);
  if (!meetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }

  const ipRate = checkIpJoinRateLimit(context.ipPrefix);
  if (!ipRate.allowed) {
    return { ok: false, message: "Join attempt is rate-limited.", status: 429 };
  }
  const meetingRate = checkMeetingJoinRateLimit(meetingCode);
  if (!meetingRate.allowed) {
    return { ok: false, message: "Join attempt is rate-limited.", status: 429 };
  }

  const displayName = normalizeParticipantName(payload.displayName);
  if (!displayName) {
    return { ok: false, message: "Enter a valid name." };
  }

  const existingMeeting = getMeetingRegistryRecord(meetingCode);
  if (!existingMeeting && payload.role !== "teacher") {
    return { ok: false, message: "Join failed.", status: 401 };
  }
  if (existingMeeting && !existingMeeting.allowed_roles.includes(payload.role)) {
    return { ok: false, message: "Join failed.", status: 401 };
  }

  if (payload.role === "teacher" && (await meetingRepo.countRole(meetingCode, "teacher")) >= 1) {
    return { ok: false, message: "Join failed.", status: 401 };
  }

  const { participantId, uuidNonce } = generateParticipantIdentity(meetingCode, payload.role, displayName);
  const displayNameHash = createHash("sha256").update(displayName).digest("hex");

  const participants = await meetingRepo.getParticipants(meetingCode);
  const registry =
    existingMeeting ??
    ensureMeetingRegistryRecord(meetingCode, participantId, {
      maxParticipants: 120
    });

  if (participants.filter((participant) => participant.active).length >= registry.max_participants) {
    return { ok: false, message: "Join attempt is rate-limited.", status: 429 };
  }

  await meetingRepo.ensureMeeting(meetingCode);
  const attendance = await meetingRepo.getAttendanceState(meetingCode);
  if (attendance.endedAt) {
    return { ok: false, message: "This meeting has already ended.", status: 403 };
  }

  const now = Date.now();
  const participant: Participant = {
    id: participantId,
    displayName,
    displayNameHash,
    role: payload.role,
    status: payload.role === "teacher" ? "active" : "pending",
    handRaised: false,
    handRaisedAt: null,
    joinedAt: now,
    lastSeenAt: now,
    uuidv7Nonce: uuidNonce,
    active: true,
    rejoinNonce: createRejoinNonce(),
    ipPrefix: context.ipPrefix,
    uaHash: context.uaHash,
    expiresAt: registry.expires_at
  };

  try {
    await meetingRepo.upsertParticipant(meetingCode, participant);
  } catch (error) {
    if (payload.role === "teacher" && isActiveTeacherUniquenessViolation(error)) {
      return { ok: false, message: "A teacher is already active in this meeting." };
    }
    throw error;
  }
  await ensureStudentAttendanceRecord(meetingCode, participant);
  publishEvent(meetingCode, { type: "participant-joined", participant });

  return { ok: true, meetingCode, participant, status: participant.status };
}

export async function getRoomAttendanceState(meetingCode: string): Promise<AttendanceState> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return {
      thresholdPercent: null,
      trackingStartedAt: null,
      endedAt: null,
      records: [],
      summary: []
    };
  }

  return meetingRepo.getAttendanceState(normalizedMeetingCode);
}

export async function listRoomParticipants(meetingCode: string, participantId?: string): Promise<Participant[]> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return [];
  }

  if (participantId) {
    await meetingRepo.touchParticipant(normalizedMeetingCode, participantId, Date.now());
  }

  return meetingRepo.getParticipants(normalizedMeetingCode);
}

export async function listVisibleMeetingChatMessages(meetingCode: string, participantId: string): Promise<MeetingChatMessage[]> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return [];
  }

  const participant = await meetingRepo.getParticipant(normalizedMeetingCode, participantId);
  if (!participant) {
    return [];
  }

  const messages = getMeetingChatMessages(normalizedMeetingCode);
  if (participant.role === "teacher") {
    return messages;
  }

  return messages.filter((message) => message.role === "teacher" || message.participantId === participantId);
}

export async function getRoomHostControls(meetingCode: string): Promise<HostControls> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ...DEFAULT_HOST_CONTROLS };
  }

  return meetingRepo.getHostControls(normalizedMeetingCode);
}

export async function canParticipantUseAiChat(meetingCode: string, participantId: string): Promise<boolean> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return false;
  }

  const participant = await meetingRepo.getParticipant(normalizedMeetingCode, participantId);
  if (!participant || participant.status !== "active") {
    return false;
  }

  const hostControls = await meetingRepo.getHostControls(normalizedMeetingCode);
  return participant.role === "teacher" || !hostControls.vivaTimeEnabled;
}

export async function sendMeetingChatMessage(
  meetingCode: string,
  participantId: string,
  content: string
): Promise<{ ok: true; message: MeetingChatMessage } | { ok: false; message: string }> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }

  const participant = await meetingRepo.getParticipant(normalizedMeetingCode, participantId);
  if (!participant || participant.status !== "active") {
    return { ok: false, message: "Only active participants can send messages." };
  }

  const hostControls = await meetingRepo.getHostControls(normalizedMeetingCode);
  if (participant.role === "student" && !hostControls.meetingChatEnabled) {
    return { ok: false, message: "Meeting Chat disabled." };
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return { ok: false, message: "Message is required." };
  }

  const message = addMeetingChatMessage(normalizedMeetingCode, {
    id: randomUUID(),
    participantId,
    displayName: participant.displayName,
    role: participant.role,
    content: trimmedContent,
    sentAt: Date.now()
  });

  return { ok: true, message };
}

export async function leaveMeeting(meetingCode: string, participantId: string): Promise<void> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return;
  }

  const participant = await meetingRepo.getParticipant(normalizedMeetingCode, participantId);
  if (!participant) {
    return;
  }

  if (participant.role === "student") {
    const attendance = await meetingRepo.getAttendanceState(normalizedMeetingCode);
    const record = attendance.records.find((entry) => entry.participantId === participantId);
    if (record) {
      await meetingRepo.upsertAttendanceRecord(normalizedMeetingCode, addAttendanceTime(record, Date.now()));
    }
  }

  await meetingRepo.upsertParticipant(normalizedMeetingCode, {
    ...participant,
    active: false,
    rejoinNonce: null,
    status: "rejected",
    lastSeenAt: Date.now()
  });
  publishEvent(normalizedMeetingCode, {
    type: "participant-status-updated",
    participantId,
    status: "rejected"
  });
  if (participant.active) {
    publishEvent(normalizedMeetingCode, { type: "participant-left", participantId });
  }
}

async function assertActiveTeacher(meetingCode: string, actorParticipantId: string): Promise<boolean> {
  const actor = await meetingRepo.getParticipant(meetingCode, actorParticipantId);
  return Boolean(actor && actor.role === "teacher" && actor.status === "active");
}

function isValidPoint(point: WhiteboardPoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= WHITEBOARD_MIN_COORD &&
    point.y >= WHITEBOARD_MIN_COORD &&
    point.x <= WHITEBOARD_MAX_COORD &&
    point.y <= WHITEBOARD_MAX_COORD
  );
}

function sanitizeDrawable(drawable: WhiteboardDrawable): WhiteboardDrawable | null {
  if (!drawable || typeof drawable !== "object") {
    return null;
  }
  if (typeof drawable.id !== "string" || drawable.id.trim().length < 4 || drawable.id.length > 80) {
    return null;
  }
  if (!Number.isFinite(drawable.createdAt) || drawable.createdAt <= 0) {
    return null;
  }

  if (drawable.kind === "stroke") {
    if (drawable.tool !== "pen" && drawable.tool !== "highlighter" && drawable.tool !== "eraser") {
      return null;
    }
    if (!Number.isFinite(drawable.width) || drawable.width < WHITEBOARD_MIN_WIDTH || drawable.width > WHITEBOARD_MAX_WIDTH) {
      return null;
    }
    if (
      !Array.isArray(drawable.points) ||
      drawable.points.length < 2 ||
      drawable.points.length > WHITEBOARD_MAX_POINTS_PER_STROKE
    ) {
      return null;
    }
    if (!drawable.points.every(isValidPoint)) {
      return null;
    }
    if (drawable.tool !== "eraser" && !HEX_COLOR_PATTERN.test(drawable.color)) {
      return null;
    }

    return {
      ...drawable,
      color: drawable.tool === "eraser" ? "#FFFFFF" : drawable.color.toUpperCase(),
      points: drawable.points.map((point) => ({ x: point.x, y: point.y }))
    };
  }

  if (drawable.kind === "shape") {
    if (drawable.tool !== "shape-rect" && drawable.tool !== "shape-circle" && drawable.tool !== "shape-line") {
      return null;
    }
    if (!HEX_COLOR_PATTERN.test(drawable.color)) {
      return null;
    }
    if (!Number.isFinite(drawable.width) || drawable.width < WHITEBOARD_MIN_WIDTH || drawable.width > WHITEBOARD_MAX_WIDTH) {
      return null;
    }
    if (!isValidPoint(drawable.start) || !isValidPoint(drawable.end)) {
      return null;
    }
    return {
      ...drawable,
      color: drawable.color.toUpperCase(),
      start: { x: drawable.start.x, y: drawable.start.y },
      end: { x: drawable.end.x, y: drawable.end.y }
    };
  }

  if (drawable.kind === "text") {
    if (drawable.tool !== "text") {
      return null;
    }
    if (!HEX_COLOR_PATTERN.test(drawable.color)) {
      return null;
    }
    if (!Number.isFinite(drawable.size) || drawable.size < WHITEBOARD_MIN_TEXT_SIZE || drawable.size > WHITEBOARD_MAX_TEXT_SIZE) {
      return null;
    }
    if (!isValidPoint(drawable.point)) {
      return null;
    }
    const normalizedText = typeof drawable.text === "string" ? drawable.text.trim() : "";
    if (!normalizedText || normalizedText.length > WHITEBOARD_MAX_TEXT_CHARS) {
      return null;
    }
    return {
      ...drawable,
      color: drawable.color.toUpperCase(),
      point: { x: drawable.point.x, y: drawable.point.y },
      text: normalizedText
    };
  }

  return null;
}

export async function getMeetingWhiteboard(
  meetingCode: string,
  participantId: string
): Promise<{ ok: true; whiteboard: WhiteboardState } | { ok: false; message: string }> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }

  const participant = await meetingRepo.getParticipant(normalizedMeetingCode, participantId);
  if (!participant || participant.status !== "active" || participant.role !== "teacher") {
    return { ok: false, message: "Only active teacher can view whiteboard." };
  }

  return { ok: true, whiteboard: getWhiteboard(normalizedMeetingCode) };
}

export async function applyMeetingWhiteboardAction(
  meetingCode: string,
  participantId: string,
  action: WhiteboardAction
): Promise<{ ok: true; whiteboard: WhiteboardState } | { ok: false; message: string; status?: number }> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code.", status: 400 };
  }

  if (!(await assertActiveTeacher(normalizedMeetingCode, participantId))) {
    return { ok: false, message: "Only active teacher can update whiteboard.", status: 403 };
  }

  const current = getWhiteboard(normalizedMeetingCode);
  const nextDrawables = [...current.drawables];
  const nextHistory = [...current.history];
  const nextFuture = [...current.future];

  if (action.type === "draw") {
    const sanitized = sanitizeDrawable(action.drawable);
    if (!sanitized) {
      return { ok: false, message: "Invalid whiteboard drawable.", status: 400 };
    }
    nextHistory.push(nextDrawables);
    nextDrawables.push(sanitized);
    const whiteboard = replaceWhiteboard(
      normalizedMeetingCode,
      nextDrawables.slice(-WHITEBOARD_MAX_DRAWABLES),
      nextHistory.slice(-WHITEBOARD_MAX_HISTORY),
      []
    );
    return { ok: true, whiteboard };
  }

  if (action.type === "undo") {
    if (nextHistory.length === 0) {
      return { ok: true, whiteboard: current };
    }
    const previous = nextHistory.pop() ?? [];
    nextFuture.push(nextDrawables);
    const whiteboard = replaceWhiteboard(
      normalizedMeetingCode,
      previous.slice(-WHITEBOARD_MAX_DRAWABLES),
      nextHistory.slice(-WHITEBOARD_MAX_HISTORY),
      nextFuture.slice(-WHITEBOARD_MAX_HISTORY)
    );
    return { ok: true, whiteboard };
  }

  if (action.type === "redo") {
    if (nextFuture.length === 0) {
      return { ok: true, whiteboard: current };
    }
    const restored = nextFuture.pop() ?? [];
    nextHistory.push(nextDrawables);
    const whiteboard = replaceWhiteboard(
      normalizedMeetingCode,
      restored.slice(-WHITEBOARD_MAX_DRAWABLES),
      nextHistory.slice(-WHITEBOARD_MAX_HISTORY),
      nextFuture.slice(-WHITEBOARD_MAX_HISTORY)
    );
    return { ok: true, whiteboard };
  }

  if (action.type === "clear") {
    nextHistory.push(nextDrawables);
    const whiteboard = replaceWhiteboard(normalizedMeetingCode, [], nextHistory.slice(-WHITEBOARD_MAX_HISTORY), []);
    return { ok: true, whiteboard };
  }

  return { ok: false, message: "Invalid whiteboard action.", status: 400 };
}

export async function approveParticipant(
  meetingCode: string,
  actorParticipantId: string,
  targetParticipantId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }
  if (!(await assertActiveTeacher(normalizedMeetingCode, actorParticipantId))) {
    return { ok: false, message: "Only active teacher can approve requests." };
  }

  const target = await meetingRepo.getParticipant(normalizedMeetingCode, targetParticipantId);
  if (!target) {
    return { ok: false, message: "Participant not found." };
  }
  if (target.status === "rejected") {
    return { ok: false, message: "Rejected participants cannot be approved." };
  }

  const updated = await meetingRepo.updateParticipantStatus(normalizedMeetingCode, targetParticipantId, "active");
  if (updated) {
    const attendance = await meetingRepo.getAttendanceState(normalizedMeetingCode);
    const activeFrom = attendance.trackingStartedAt && !attendance.endedAt ? Date.now() : null;
    await ensureStudentAttendanceRecord(normalizedMeetingCode, updated, activeFrom);
    publishEvent(normalizedMeetingCode, { type: "participant-status-updated", participantId: targetParticipantId, status: "active" });
  }

  return { ok: true };
}

export async function rejectParticipant(
  meetingCode: string,
  actorParticipantId: string,
  targetParticipantId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }
  if (!(await assertActiveTeacher(normalizedMeetingCode, actorParticipantId))) {
    return { ok: false, message: "Only active teacher can reject requests." };
  }

  const target = await meetingRepo.getParticipant(normalizedMeetingCode, targetParticipantId);
  if (!target) {
    return { ok: false, message: "Participant not found." };
  }
  if (target.role === "teacher") {
    return { ok: false, message: "Teacher cannot be rejected from this control." };
  }

  const updated = await meetingRepo.updateParticipantStatus(normalizedMeetingCode, targetParticipantId, "rejected");
  if (updated) {
    publishEvent(normalizedMeetingCode, { type: "participant-status-updated", participantId: targetParticipantId, status: "rejected" });
  }

  return { ok: true };
}

export async function removeParticipantFromRoom(
  meetingCode: string,
  actorParticipantId: string,
  targetParticipantId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }
  if (!(await assertActiveTeacher(normalizedMeetingCode, actorParticipantId))) {
    return { ok: false, message: "Only active teacher can remove participants." };
  }

  const target = await meetingRepo.getParticipant(normalizedMeetingCode, targetParticipantId);
  if (!target) {
    return { ok: false, message: "Participant not found." };
  }
  if (target.role === "teacher") {
    return { ok: false, message: "Teacher cannot be removed from this control." };
  }

  const attendance = await meetingRepo.getAttendanceState(normalizedMeetingCode);
  const record = attendance.records.find((entry) => entry.participantId === targetParticipantId);
  if (record) {
    await meetingRepo.upsertAttendanceRecord(normalizedMeetingCode, addAttendanceTime(record, Date.now()));
  }

  const removed = await meetingRepo.removeParticipant(normalizedMeetingCode, targetParticipantId);
  if (removed) {
    publishEvent(normalizedMeetingCode, { type: "participant-left", participantId: targetParticipantId });
  }

  return { ok: true };
}

export async function banParticipantFromRoom(
  meetingCode: string,
  actorParticipantId: string,
  targetParticipantId: string
): Promise<{ ok: true; bannedUntil: string } | { ok: false; message: string }> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }
  if (!(await assertActiveTeacher(normalizedMeetingCode, actorParticipantId))) {
    return { ok: false, message: "Only active teacher can ban participants." };
  }

  const target = await meetingRepo.getParticipant(normalizedMeetingCode, targetParticipantId);
  if (!target) {
    return { ok: false, message: "Participant not found." };
  }
  if (target.role === "teacher") {
    return { ok: false, message: "Teacher cannot be banned from this control." };
  }
  await meetingRepo.banParticipantSession(normalizedMeetingCode, target.id, actorParticipantId);
  invalidateRejoinNonce(target.rejoinNonce);

  const attendance = await meetingRepo.getAttendanceState(normalizedMeetingCode);
  const record = attendance.records.find((entry) => entry.participantId === targetParticipantId) ?? createAttendanceRecord(target);
  await meetingRepo.upsertAttendanceRecord(normalizedMeetingCode, {
    ...addAttendanceTime(record, Date.now()),
    banned: true
  });

  const removed = await meetingRepo.removeParticipant(normalizedMeetingCode, targetParticipantId);
  if (removed) {
    publishEvent(normalizedMeetingCode, { type: "participant-left", participantId: targetParticipantId });
  }

  return { ok: true, bannedUntil: target.expiresAt };
}

export async function setAttendanceThreshold(
  meetingCode: string,
  actorParticipantId: string,
  thresholdPercent: number
): Promise<{ ok: true; attendance: AttendanceState } | { ok: false; message: string; status?: number }> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code.", status: 400 };
  }
  if (!(await assertActiveTeacher(normalizedMeetingCode, actorParticipantId))) {
    return { ok: false, message: "Only active teacher can set attendance threshold.", status: 403 };
  }

  const current = await meetingRepo.getAttendanceState(normalizedMeetingCode);
  if (current.endedAt) {
    return { ok: false, message: "Meeting has already ended.", status: 400 };
  }

  const now = Date.now();
  const nextThreshold = clampAttendanceThreshold(thresholdPercent);
  const participants = await meetingRepo.getParticipants(normalizedMeetingCode);
  await Promise.all(
    participants
      .filter((participant) => participant.role === "student")
      .map((participant) => {
        const existing = current.records.find((record) => record.participantId === participant.id) ?? createAttendanceRecord(participant);
        return meetingRepo.upsertAttendanceRecord(normalizedMeetingCode, {
          ...existing,
          displayName: participant.displayName,
          activeFrom: existing.activeFrom ?? (participant.status === "active" ? now : null),
          lastSeenAt: now
        });
      })
  );

  const attendance = await meetingRepo.updateAttendanceState(normalizedMeetingCode, {
    thresholdPercent: nextThreshold,
    trackingStartedAt: current.trackingStartedAt ?? now
  });
  publishEvent(normalizedMeetingCode, { type: "attendance-updated" });
  return { ok: true, attendance };
}

export async function endMeetingWithAttendance(
  meetingCode: string,
  actorParticipantId: string
): Promise<{ ok: true; attendance: AttendanceState } | { ok: false; message: string; status?: number }> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code.", status: 400 };
  }
  if (!(await assertActiveTeacher(normalizedMeetingCode, actorParticipantId))) {
    return { ok: false, message: "Only active teacher can end meeting.", status: 403 };
  }

  const current = await meetingRepo.getAttendanceState(normalizedMeetingCode);
  if (!current.thresholdPercent || !current.trackingStartedAt) {
    return { ok: false, message: "Set attendance threshold before ending the meeting.", status: 400 };
  }
  if (current.endedAt) {
    return { ok: true, attendance: current };
  }

  const endedAt = Date.now();
  const closedRecords = await Promise.all(
    current.records.map(async (record) => {
      const next = record.activeFrom ? addAttendanceTime(record, endedAt) : record;
      await meetingRepo.upsertAttendanceRecord(normalizedMeetingCode, next);
      return next;
    })
  );
  const summary = buildAttendanceSummary({ ...current, records: closedRecords }, endedAt);
  const attendance = await meetingRepo.updateAttendanceState(normalizedMeetingCode, {
    endedAt,
    summary
  });
  publishEvent(normalizedMeetingCode, { type: "meeting-ended" });
  return { ok: true, attendance };
}

export async function updateRoomHostControls(
  meetingCode: string,
  actorParticipantId: string,
  updates: Partial<Pick<HostControls, "forceStudentCamerasOn" | "vivaTimeEnabled" | "meetingChatEnabled">> & {
    muteAll?: boolean;
  }
): Promise<{ ok: true; hostControls: HostControls } | { ok: false; message: string }> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }
  if (!(await assertActiveTeacher(normalizedMeetingCode, actorParticipantId))) {
    return { ok: false, message: "Only active teacher can update host controls." };
  }

  const current = await meetingRepo.getHostControls(normalizedMeetingCode);
  const nextUpdates: Partial<HostControls> = {};

  if (updates.muteAll) {
    nextUpdates.muteAllRequestId = current.muteAllRequestId + 1;
  }
  if (typeof updates.forceStudentCamerasOn === "boolean") {
    nextUpdates.forceStudentCamerasOn = updates.forceStudentCamerasOn;
  }
  if (typeof updates.vivaTimeEnabled === "boolean") {
    nextUpdates.vivaTimeEnabled = updates.vivaTimeEnabled;
  }
  if (typeof updates.meetingChatEnabled === "boolean") {
    nextUpdates.meetingChatEnabled = updates.meetingChatEnabled;
  }

  const hostControls = await meetingRepo.updateHostControls(normalizedMeetingCode, nextUpdates);
  return { ok: true, hostControls };
}

export async function setParticipantHandRaised(
  meetingCode: string,
  actorParticipantId: string,
  handRaised: boolean
): Promise<{ ok: true } | { ok: false; message: string }> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }

  const participant = await meetingRepo.getParticipant(normalizedMeetingCode, actorParticipantId);
  if (!participant) {
    return { ok: false, message: "Participant not found." };
  }
  if (participant.status !== "active") {
    return { ok: false, message: "Only active participants can use raise hand." };
  }

  const handRaisedAt = handRaised ? Date.now() : null;
  const updated = await meetingRepo.updateParticipantHandRaised(
    normalizedMeetingCode,
    actorParticipantId,
    handRaised,
    handRaisedAt,
    Date.now()
  );
  if (!updated) {
    return { ok: false, message: "Could not update raise hand state." };
  }

  publishEvent(normalizedMeetingCode, {
    type: "participant-hand-updated",
    participantId: actorParticipantId,
    handRaised,
    handRaisedAt
  });

  return { ok: true };
}

export async function controlParticipantMedia(
  meetingCode: string,
  actorParticipantId: string,
  targetParticipantId: string,
  media: "camera" | "mic",
  enabled: boolean
): Promise<{ ok: true } | { ok: false; message: string }> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }
  if (!(await assertActiveTeacher(normalizedMeetingCode, actorParticipantId))) {
    return { ok: false, message: "Only active teacher can control participant media." };
  }

  const target = await meetingRepo.getParticipant(normalizedMeetingCode, targetParticipantId);
  if (!target || target.status !== "active") {
    return { ok: false, message: "Active participant not found." };
  }
  if (target.role === "teacher") {
    return { ok: false, message: "Teacher media is not controlled here." };
  }

  publishEvent(normalizedMeetingCode, {
    type: "participant-media-control",
    participantId: targetParticipantId,
    media,
    enabled
  });
  return { ok: true };
}

export function sendSignal(
  meetingCode: string,
  fromParticipantId: string,
  toParticipantId: string,
  signalType: "offer" | "answer" | "ice-candidate",
  signal: RTCSessionDescriptionInit | RTCIceCandidateInit
): void {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return;
  }

  publishEvent(normalizedMeetingCode, {
    type: "signal",
    fromParticipantId,
    toParticipantId,
    signalType,
    signal
  });
}

export { subscribeToRoom };

export async function getParticipantForMeeting(meetingCode: string, participantId: string): Promise<Participant | null> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return null;
  }
  if (await meetingRepo.isParticipantSessionBanned(normalizedMeetingCode, participantId)) {
    return null;
  }
  return meetingRepo.getParticipant(normalizedMeetingCode, participantId);
}

export async function isParticipantSessionBanned(meetingCode: string, participantId: string): Promise<boolean> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return false;
  }
  return meetingRepo.isParticipantSessionBanned(normalizedMeetingCode, participantId);
}

export async function updateParticipantRejoinNonce(
  meetingCode: string,
  participantId: string,
  rejoinNonce: string | null
): Promise<Participant | null> {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return null;
  }

  const participant = await meetingRepo.getParticipant(normalizedMeetingCode, participantId);
  if (!participant) {
    return null;
  }

  const updated: Participant = {
    ...participant,
    rejoinNonce,
    lastSeenAt: Date.now()
  };

  await meetingRepo.upsertParticipant(normalizedMeetingCode, updated);
  return updated;
}

