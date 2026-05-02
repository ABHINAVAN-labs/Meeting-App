import { randomUUID } from "crypto";
import { normalizeMeetingCode, normalizeParticipantName } from "./validation";
import {
  countRole,
  getParticipants,
  publishEvent,
  removeParticipant,
  touchParticipant,
  upsertParticipant
} from "./store";
import type { JoinMeetingRequest, Participant } from "./types";

export type JoinResult =
  | { ok: true; meetingCode: string; participant: Participant }
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
    joinedAt: now,
    lastSeenAt: now
  };

  upsertParticipant(meetingCode, participant);
  return { ok: true, meetingCode, participant };
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

export function leaveMeeting(meetingCode: string, participantId: string): void {
  const normalizedMeetingCode = normalizeMeetingCode(meetingCode);
  if (!normalizedMeetingCode) {
    return;
  }
  removeParticipant(normalizedMeetingCode, participantId);
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
