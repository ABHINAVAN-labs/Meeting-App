export type ParticipantRole = "student" | "teacher";
export type ParticipantStatus = "pending" | "active" | "rejected";

export type Participant = {
  id: string;
  displayName: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  joinedAt: number;
  lastSeenAt: number;
};

export type Room = {
  meetingCode: string;
  participants: Map<string, Participant>;
};

export type MeetingEvent =
  | { type: "snapshot"; participants: Participant[]; sessionParticipantId: string }
  | { type: "participant-joined"; participant: Participant }
  | { type: "participant-left"; participantId: string }
  | { type: "participant-status-updated"; participantId: string; status: ParticipantStatus }
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
