import type { MeetingEvent, Participant, Room } from "./types";

const rooms = new Map<string, Room>();
const roomSubscribers = new Map<string, Set<(event: MeetingEvent) => void>>();

function getOrCreateRoom(meetingCode: string): Room {
  const existing = rooms.get(meetingCode);
  if (existing) {
    return existing;
  }

  const created: Room = {
    meetingCode,
    participants: new Map<string, Participant>()
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

  existing.lastSeenAt = Date.now();
  room?.participants.set(participantId, existing);
}

export function getParticipants(meetingCode: string): Participant[] {
  const room = rooms.get(meetingCode);
  if (!room) {
    return [];
  }

  return [...room.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt);
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
