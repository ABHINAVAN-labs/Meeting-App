import type {
  HostControls,
  MeetingChatMessage,
  MeetingEvent,
  Participant,
  Room,
  WhiteboardDrawable,
  WhiteboardState
} from "./types";

const rooms = new Map<string, Room>();
const roomSubscribers = new Map<string, Set<(event: MeetingEvent) => void>>();
const DEFAULT_HOST_CONTROLS: HostControls = {
  muteAllRequestId: 0,
  forceStudentCamerasOn: false,
  vivaTimeEnabled: false,
  meetingChatEnabled: false
};
const WHITEBOARD_MAX_DRAWABLES = 600;
const WHITEBOARD_MAX_HISTORY = 30;

function createEmptyWhiteboardState(): WhiteboardState {
  return {
    version: 0,
    drawables: [],
    lastUpdatedAt: new Date(0).toISOString(),
    history: [],
    future: []
  };
}

function normalizeHostControls(hostControls?: Partial<HostControls>): HostControls {
  return {
    ...DEFAULT_HOST_CONTROLS,
    ...hostControls
  };
}

function normalizeParticipantStatus(participant: Participant): Participant {
  if (participant.status && typeof participant.handRaised === "boolean" && "handRaisedAt" in participant) {
    return participant;
  }

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
    chatMessages: [],
    hostControls: normalizeHostControls(),
    whiteboard: createEmptyWhiteboardState()
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

export function getHostControls(meetingCode: string): HostControls {
  const room = getOrCreateRoom(meetingCode);
  room.hostControls = normalizeHostControls(room.hostControls);
  return room.hostControls;
}

export function updateHostControls(meetingCode: string, updates: Partial<HostControls>): HostControls {
  const room = getOrCreateRoom(meetingCode);
  room.hostControls = normalizeHostControls({
    ...room.hostControls,
    ...updates
  });
  return room.hostControls;
}

export function getWhiteboard(meetingCode: string): WhiteboardState {
  const room = getOrCreateRoom(meetingCode);
  room.whiteboard ??= createEmptyWhiteboardState();
  const legacyWhiteboard = room.whiteboard as WhiteboardState & {
    strokes?: Array<{
      id: string;
      tool: "pen" | "eraser";
      color: string;
      width: number;
      points: { x: number; y: number }[];
      createdAt: number;
    }>;
  };
  if (!Array.isArray(room.whiteboard.drawables) && Array.isArray(legacyWhiteboard.strokes)) {
    room.whiteboard.drawables = legacyWhiteboard.strokes.map((stroke) => ({
      id: stroke.id,
      kind: "stroke" as const,
      tool: stroke.tool,
      color: stroke.color,
      width: stroke.width,
      points: stroke.points,
      createdAt: stroke.createdAt
    }));
  }
  room.whiteboard.history ??= [];
  room.whiteboard.future ??= [];
  return room.whiteboard;
}

export function replaceWhiteboard(
  meetingCode: string,
  drawables: WhiteboardDrawable[],
  history: WhiteboardDrawable[][],
  future: WhiteboardDrawable[][]
): WhiteboardState {
  const room = getOrCreateRoom(meetingCode);
  room.whiteboard ??= createEmptyWhiteboardState();
  room.whiteboard.version += 1;
  room.whiteboard.drawables = drawables.slice(-WHITEBOARD_MAX_DRAWABLES);
  room.whiteboard.history = history.slice(-WHITEBOARD_MAX_HISTORY);
  room.whiteboard.future = future.slice(-WHITEBOARD_MAX_HISTORY);
  room.whiteboard.lastUpdatedAt = new Date().toISOString();
  publishEvent(meetingCode, { type: "whiteboard-updated", version: room.whiteboard.version });
  return room.whiteboard;
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
    if (participant.role === role && participant.status !== "rejected") {
      count += 1;
    }
  }
  return count;
}

export function subscribeRoomEvents(meetingCode: string, listener: (event: MeetingEvent) => void): () => void {
  const subscribers = roomSubscribers.get(meetingCode) ?? new Set();
  subscribers.add(listener);
  roomSubscribers.set(meetingCode, subscribers);

  return () => {
    const active = roomSubscribers.get(meetingCode);
    if (!active) {
      return;
    }
    active.delete(listener);
    if (active.size === 0) {
      roomSubscribers.delete(meetingCode);
    }
  };
}

export function subscribeToRoom(meetingCode: string, listener: (event: MeetingEvent) => void): () => void {
  return subscribeRoomEvents(meetingCode, listener);
}

export function publishEvent(meetingCode: string, event: MeetingEvent): void {
  const subscribers = roomSubscribers.get(meetingCode);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  subscribers.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Ignore subscriber failure
    }
  });
}
