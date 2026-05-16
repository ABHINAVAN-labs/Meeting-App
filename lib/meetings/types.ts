export type ParticipantRole = "student" | "teacher";
export type ParticipantStatus = "pending" | "active" | "rejected";

export type Participant = {
  id: string;
  displayName: string;
  displayNameHash: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  handRaised: boolean;
  handRaisedAt: number | null;
  joinedAt: number;
  lastSeenAt: number;
  uuidv7Nonce: string;
  active: boolean;
  rejoinNonce: string | null;
  ipPrefix: string;
  uaHash: string;
  expiresAt: string;
};

export type MeetingChatMessage = {
  id: string;
  participantId: string;
  displayName: string;
  role: ParticipantRole;
  content: string;
  sentAt: number;
};

export type HostControls = {
  muteAllRequestId: number;
  forceStudentCamerasOn: boolean;
  vivaTimeEnabled: boolean;
  meetingChatEnabled: boolean;
};

export type WhiteboardTool =
  | "pen"
  | "highlighter"
  | "eraser"
  | "shape-rect"
  | "shape-circle"
  | "shape-line"
  | "text";

export type WhiteboardPoint = {
  x: number;
  y: number;
};

export type WhiteboardStrokeDrawable = {
  id: string;
  kind: "stroke";
  tool: "pen" | "highlighter" | "eraser";
  color: string;
  width: number;
  points: WhiteboardPoint[];
  createdAt: number;
};

export type WhiteboardShapeDrawable = {
  id: string;
  kind: "shape";
  tool: "shape-rect" | "shape-circle" | "shape-line";
  color: string;
  width: number;
  start: WhiteboardPoint;
  end: WhiteboardPoint;
  createdAt: number;
};

export type WhiteboardTextDrawable = {
  id: string;
  kind: "text";
  tool: "text";
  color: string;
  size: number;
  point: WhiteboardPoint;
  text: string;
  createdAt: number;
};

export type WhiteboardDrawable = WhiteboardStrokeDrawable | WhiteboardShapeDrawable | WhiteboardTextDrawable;

export type WhiteboardAction =
  | { type: "draw"; drawable: WhiteboardDrawable }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" };

export type WhiteboardState = {
  version: number;
  drawables: WhiteboardDrawable[];
  lastUpdatedAt: string;
  history: WhiteboardDrawable[][];
  future: WhiteboardDrawable[][];
};

export type Room = {
  meetingCode: string;
  participants: Map<string, Participant>;
  chatMessages: MeetingChatMessage[];
  hostControls: HostControls;
  whiteboard: WhiteboardState;
};

export type MeetingEvent =
  | { type: "snapshot"; participants: Participant[]; sessionParticipantId: string }
  | { type: "participant-joined"; participant: Participant }
  | { type: "participant-left"; participantId: string }
  | { type: "participant-status-updated"; participantId: string; status: ParticipantStatus }
  | { type: "participant-hand-updated"; participantId: string; handRaised: boolean; handRaisedAt: number | null }
  | { type: "whiteboard-updated"; version: number }
  | { type: "participant-media-control"; participantId: string; media: "camera" | "mic"; enabled: boolean }
  | {
      type: "signal";
      fromParticipantId: string;
      toParticipantId: string;
      signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
      signalType: "offer" | "answer" | "ice-candidate";
    };

export type JoinMeetingRequest = {
  meetingCode: string;
  displayName: string;
  role: ParticipantRole;
};
