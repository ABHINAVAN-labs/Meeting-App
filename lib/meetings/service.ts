import { randomUUID } from "crypto";
import { normalizeMeetingCode, normalizeParticipantName } from "./validation";
import {
  addMeetingChatMessage,
  countRole,
  getHostControls,
  getMeetingChatMessages,
  getWhiteboard,
  getParticipant,
  getParticipants,
  publishEvent,
  replaceWhiteboard,
  removeParticipant,
  touchParticipant,
  updateHostControls,
  updateParticipantHandRaised,
  updateParticipantStatus,
  upsertParticipant
} from "./store";
import type { HostControls, JoinMeetingRequest, MeetingChatMessage, Participant } from "./types";
import type { WhiteboardAction, WhiteboardDrawable, WhiteboardPoint, WhiteboardState } from "./types";

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

export type JoinResult =
  | { ok: true; meetingCode: string; participant: Participant; status: Participant["status"] }
  | { ok: false; message: string };

export function joinMeeting(payload: JoinMeetingRequest): JoinResult {
  const meetingCode = normalizeMeetingCode(payload.meetingCode);
  if (!meetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }

  const displayName = normalizeParticipantName(payload.displayName);
  if (!displayName) {
    return { ok: false, message: "Enter a valid name (2-80 chars)." };
  }
  if (payload.role === "teacher" && countRole(meetingCode, "teacher") >= 1) {
    return { ok: false, message: "A teacher is already active in this meeting." };
  }

  const now = Date.now();
  const participant: Participant = {
    id: randomUUID(),
    displayName,
    role: payload.role,
    status: payload.role === "teacher" ? "active" : "pending",
    handRaised: false,
    handRaisedAt: null,
    joinedAt: now,
    lastSeenAt: now
  };

  upsertParticipant(meetingCode, participant);
  return { ok: true, meetingCode, participant, status: participant.status };
}

export function listRoomParticipants(meetingCode: string, participantId?: string): Participant[] {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return [];
  }

  if (participantId) {
    touchParticipant(normalizedMeetingCode, participantId);
  }

  return getParticipants(normalizedMeetingCode);
}

export function listVisibleMeetingChatMessages(meetingCode: string, participantId: string): MeetingChatMessage[] {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return [];
  }

  const participant = getParticipant(normalizedMeetingCode, participantId);
  if (!participant) {
    return [];
  }

  const messages = getMeetingChatMessages(normalizedMeetingCode);
  if (participant.role === "teacher") {
    return messages;
  }

  return messages.filter((message) => message.role === "teacher" || message.participantId === participantId);
}

export function getRoomHostControls(meetingCode: string): HostControls {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return {
      muteAllRequestId: 0,
      forceStudentCamerasOn: false,
      vivaTimeEnabled: false,
      meetingChatEnabled: false
    };
  }

  return getHostControls(normalizedMeetingCode);
}

export function canParticipantUseAiChat(meetingCode: string, participantId: string): boolean {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return false;
  }

  const participant = getParticipant(normalizedMeetingCode, participantId);
  if (!participant || participant.status !== "active") {
    return false;
  }

  return participant.role === "teacher" || !getHostControls(normalizedMeetingCode).vivaTimeEnabled;
}

export function sendMeetingChatMessage(
  meetingCode: string,
  participantId: string,
  content: string
): { ok: true; message: MeetingChatMessage } | { ok: false; message: string } {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }

  const participant = getParticipant(normalizedMeetingCode, participantId);
  if (!participant || participant.status !== "active") {
    return { ok: false, message: "Only active participants can send messages." };
  }
  if (participant.role === "student" && !getHostControls(normalizedMeetingCode).meetingChatEnabled) {
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

export function leaveMeeting(meetingCode: string, participantId: string): void {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return;
  }
  removeParticipant(normalizedMeetingCode, participantId);
}

function assertActiveTeacher(meetingCode: string, actorParticipantId: string): boolean {
  const actor = getParticipant(meetingCode, actorParticipantId);
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

export function getMeetingWhiteboard(
  meetingCode: string,
  participantId: string
): { ok: true; whiteboard: WhiteboardState } | { ok: false; message: string } {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }

  const participant = getParticipant(normalizedMeetingCode, participantId);
  if (!participant || participant.status !== "active" || participant.role !== "teacher") {
    return { ok: false, message: "Only active teacher can view whiteboard." };
  }

  return { ok: true, whiteboard: getWhiteboard(normalizedMeetingCode) };
}

export function applyMeetingWhiteboardAction(
  meetingCode: string,
  participantId: string,
  action: WhiteboardAction
): { ok: true; whiteboard: WhiteboardState } | { ok: false; message: string; status?: number } {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code.", status: 400 };
  }

  if (!assertActiveTeacher(normalizedMeetingCode, participantId)) {
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

export function approveParticipant(
  meetingCode: string,
  actorParticipantId: string,
  targetParticipantId: string
): { ok: true } | { ok: false; message: string } {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }
  if (!assertActiveTeacher(normalizedMeetingCode, actorParticipantId)) {
    return { ok: false, message: "Only active teacher can approve requests." };
  }

  const target = getParticipant(normalizedMeetingCode, targetParticipantId);
  if (!target) {
    return { ok: false, message: "Participant not found." };
  }
  if (target.status === "rejected") {
    return { ok: false, message: "Rejected participants cannot be approved." };
  }

  updateParticipantStatus(normalizedMeetingCode, targetParticipantId, "active");
  return { ok: true };
}

export function rejectParticipant(
  meetingCode: string,
  actorParticipantId: string,
  targetParticipantId: string
): { ok: true } | { ok: false; message: string } {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }
  if (!assertActiveTeacher(normalizedMeetingCode, actorParticipantId)) {
    return { ok: false, message: "Only active teacher can reject requests." };
  }

  const target = getParticipant(normalizedMeetingCode, targetParticipantId);
  if (!target) {
    return { ok: false, message: "Participant not found." };
  }
  if (target.role === "teacher") {
    return { ok: false, message: "Teacher cannot be rejected from this control." };
  }

  updateParticipantStatus(normalizedMeetingCode, targetParticipantId, "rejected");
  return { ok: true };
}

export function removeParticipantFromRoom(
  meetingCode: string,
  actorParticipantId: string,
  targetParticipantId: string
): { ok: true } | { ok: false; message: string } {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }
  if (!assertActiveTeacher(normalizedMeetingCode, actorParticipantId)) {
    return { ok: false, message: "Only active teacher can remove participants." };
  }

  const target = getParticipant(normalizedMeetingCode, targetParticipantId);
  if (!target) {
    return { ok: false, message: "Participant not found." };
  }
  if (target.role === "teacher") {
    return { ok: false, message: "Teacher cannot be removed from this control." };
  }

  removeParticipant(normalizedMeetingCode, targetParticipantId);
  return { ok: true };
}

export function updateRoomHostControls(
  meetingCode: string,
  actorParticipantId: string,
  updates: Partial<Pick<HostControls, "forceStudentCamerasOn" | "vivaTimeEnabled" | "meetingChatEnabled">> & {
    muteAll?: boolean;
  }
): { ok: true; hostControls: HostControls } | { ok: false; message: string } {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }
  if (!assertActiveTeacher(normalizedMeetingCode, actorParticipantId)) {
    return { ok: false, message: "Only active teacher can update host controls." };
  }

  const current = getHostControls(normalizedMeetingCode);
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

  return { ok: true, hostControls: updateHostControls(normalizedMeetingCode, nextUpdates) };
}

export function setParticipantHandRaised(
  meetingCode: string,
  actorParticipantId: string,
  handRaised: boolean
): { ok: true } | { ok: false; message: string } {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }

  const participant = getParticipant(normalizedMeetingCode, actorParticipantId);
  if (!participant) {
    return { ok: false, message: "Participant not found." };
  }
  if (participant.status !== "active") {
    return { ok: false, message: "Only active participants can use raise hand." };
  }

  const updated = updateParticipantHandRaised(normalizedMeetingCode, actorParticipantId, handRaised);
  if (!updated) {
    return { ok: false, message: "Could not update raise hand state." };
  }

  return { ok: true };
}

export function controlParticipantMedia(
  meetingCode: string,
  actorParticipantId: string,
  targetParticipantId: string,
  media: "camera" | "mic",
  enabled: boolean
): { ok: true } | { ok: false; message: string } {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return { ok: false, message: "Invalid meeting code." };
  }
  if (!assertActiveTeacher(normalizedMeetingCode, actorParticipantId)) {
    return { ok: false, message: "Only active teacher can control participant media." };
  }

  const target = getParticipant(normalizedMeetingCode, targetParticipantId);
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
