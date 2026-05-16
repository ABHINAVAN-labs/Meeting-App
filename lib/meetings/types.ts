export type ParticipantRole = "student" | "teacher";
export type ParticipantStatus = "pending" | "active" | "rejected";
export type JoinIdentityType = "email" | "phone";

export type Participant = {
  id: string;
  displayName: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  joinIdentityType: JoinIdentityType | null;
  joinIdentityHash: string | null;
  handRaised: boolean;
  handRaisedAt: number | null;
  joinedAt: number;
  lastSeenAt: number;
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

export type AttendanceStatus = "present" | "absent" | "banned";

export type AttendanceRecord = {
  participantId: string;
  displayName: string;
  role: "student";
  joinedAt: number;
  activeFrom: number | null;
  attendedMs: number;
  banned: boolean;
  lastSeenAt: number;
};

export type AttendanceSummaryEntry = {
  participantId: string;
  displayName: string;
  status: AttendanceStatus;
  attendancePercent: number;
  attendedMs: number;
};

export type AttendanceState = {
  thresholdPercent: number | null;
  trackingStartedAt: number | null;
  endedAt: number | null;
  records: AttendanceRecord[];
  summary: AttendanceSummaryEntry[];
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
  attendance: AttendanceState;
};

export type MeetingEvent =
  | { type: "snapshot"; participants: Participant[]; sessionParticipantId: string }
  | { type: "participant-joined"; participant: Participant }
  | { type: "participant-left"; participantId: string }
  | { type: "participant-status-updated"; participantId: string; status: ParticipantStatus }
  | { type: "participant-hand-updated"; participantId: string; handRaised: boolean; handRaisedAt: number | null }
  | { type: "attendance-updated" }
  | { type: "meeting-ended" }
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
  identityType?: JoinIdentityType;
  identityValue?: string;
};
