export type ParticipantRole = "student" | "teacher";
export type ParticipantStatus = "pending" | "active" | "rejected";

export type Participant = {
  id: string;
  displayName: string;
  role: ParticipantRole;
  status: ParticipantStatus;
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

export type Room = {
  meetingCode: string;
  participants: Map<string, Participant>;
  chatMessages: MeetingChatMessage[];
  hostControls: HostControls;
};

export type MeetingEvent =
  | { type: "snapshot"; participants: Participant[]; sessionParticipantId: string }
  | { type: "participant-joined"; participant: Participant }
  | { type: "participant-left"; participantId: string }
  | { type: "participant-status-updated"; participantId: string; status: ParticipantStatus }
  | { type: "participant-hand-updated"; participantId: string; handRaised: boolean; handRaisedAt: number | null }
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
