import type { MeetingChatMessage, MeetingEvent, Participant, Room } from "./types";

const rooms = new Map<string, Room>();
const roomSubscribers = new Map<string, Set<(event: MeetingEvent) => void>>();

function normalizeParticipantStatus(participant: Participant): Participant {
  if (participant.status && typeof participant.handRaised === "boolean" && "handRaisedAt" in participant) {
    return participant;
  }

  // Compatibility fallback for participants created before status was introduced.
  const normalized: Participant = {
    ...participant,
    status: participant.status ?? "active",
    handRaised: participant.handRaised ?? false,
    handRaisedAt: participant.handRaisedAt ?? null
  };
  return normalized;
}

function getOrCreateRoom(meetingCode: string): Room {
  const existing = rooms.get(meetingCode);
  if (existing) {
    return existing;
  }

  const created: Room = {
    meetingCode,
    participants: new Map<string, Participant>(),
    chatMessages: []
  };
  rooms.set(meetingCode, created);
  return created;
}

export function upsertParticipant(meetingCode: string, participant: Participant): Room {
  const room = getOrCreateRoom(meetingCode);
  room.participants.set(participant.id, participant);
  publishEvent(meetingCode, { type: "participant-joined", participant });
  return room;
}

export function touchParticipant(meetingCode: string, participantId: string): void {
  const room = rooms.get(meetingCode);
  const existing = room?.participants.get(participantId);
  if (!existing) {
    return;
  }

  const normalized = normalizeParticipantStatus(existing);
  existing.lastSeenAt = Date.now();
  room?.participants.set(participantId, { ...normalized, lastSeenAt: Date.now() });
}

export function getParticipant(meetingCode: string, participantId: string): Participant | null {
  const room = rooms.get(meetingCode);
  if (!room) {
    return null;
  }

  const participant = room.participants.get(participantId);
  if (!participant) {
    return null;
  }

  const normalized = normalizeParticipantStatus(participant);
  room.participants.set(participantId, normalized);
  return normalized;
}

export function getParticipants(meetingCode: string): Participant[] {
  const room = rooms.get(meetingCode);
  if (!room) {
    return [];
  }

  return [...room.participants.entries()]
    .map(([id, participant]) => {
      const normalized = normalizeParticipantStatus(participant);
      room.participants.set(id, normalized);
      return normalized;
    })
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

export function addMeetingChatMessage(meetingCode: string, message: MeetingChatMessage): MeetingChatMessage {
  const room = getOrCreateRoom(meetingCode);
  room.chatMessages ??= [];
  room.chatMessages.push(message);
  return message;
}

export function getMeetingChatMessages(meetingCode: string): MeetingChatMessage[] {
  const room = rooms.get(meetingCode);
  if (!room) {
    return [];
  }

  room.chatMessages ??= [];
  return room.chatMessages;
}

export function removeParticipant(meetingCode: string, participantId: string): void {
  const room = rooms.get(meetingCode);
  if (!room) {
    return;
  }

  const existed = room.participants.delete(participantId);
  if (existed) {
    publishEvent(meetingCode, { type: "participant-left", participantId });
  }

  if (room.participants.size === 0) {
    rooms.delete(meetingCode);
    roomSubscribers.delete(meetingCode);
  }
}

export function updateParticipantStatus(
  meetingCode: string,
  participantId: string,
  status: Participant["status"]
): Participant | null {
  const room = rooms.get(meetingCode);
  const existing = room?.participants.get(participantId);
  if (!room || !existing) {
    return null;
  }

  existing.status = status;
  existing.lastSeenAt = Date.now();
  room.participants.set(participantId, existing);
  publishEvent(meetingCode, { type: "participant-status-updated", participantId, status });
  return existing;
}

export function updateParticipantHandRaised(
  meetingCode: string,
  participantId: string,
  handRaised: boolean
): Participant | null {
  const room = rooms.get(meetingCode);
  const existing = room?.participants.get(participantId);
  if (!room || !existing) {
    return null;
  }

  const normalized = normalizeParticipantStatus(existing);
  const handRaisedAt = handRaised ? Date.now() : null;

  const updated: Participant = {
    ...normalized,
    handRaised,
    handRaisedAt,
    lastSeenAt: Date.now()
  };

  room.participants.set(participantId, updated);
  publishEvent(meetingCode, {
    type: "participant-hand-updated",
    participantId,
    handRaised,
    handRaisedAt
  });
  return updated;
}

export function countRole(meetingCode: string, role: Participant["role"]): number {
  const room = rooms.get(meetingCode);
  if (!room) {
    return 0;
  }

  let count = 0;
  for (const participant of room.participants.values()) {
    if (participant.role === role) {
      count += 1;
    }
  }
  return count;
}

export function subscribeToRoom(meetingCode: string, listener: (event: MeetingEvent) => void): () => void {
  const listeners = roomSubscribers.get(meetingCode) ?? new Set<(event: MeetingEvent) => void>();
  listeners.add(listener);
  roomSubscribers.set(meetingCode, listeners);

  return () => {
    const current = roomSubscribers.get(meetingCode);
    if (!current) {
      return;
    }

    current.delete(listener);
    if (current.size === 0) {
      roomSubscribers.delete(meetingCode);
    }
  };
}

export function publishEvent(meetingCode: string, event: MeetingEvent): void {
  const listeners = roomSubscribers.get(meetingCode);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener(event);
  }
}
