import { randomUUID } from "crypto";
import { normalizeMeetingCode, normalizeParticipantName } from "./validation";
import {
  addMeetingChatMessage,
  countRole,
  getMeetingChatMessages,
  getParticipant,
  getParticipants,
  publishEvent,
  removeParticipant,
  touchParticipant,
  updateParticipantHandRaised,
  updateParticipantStatus,
  upsertParticipant
} from "./store";
import type { JoinMeetingRequest, MeetingChatMessage, Participant } from "./types";

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
