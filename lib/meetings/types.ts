export type ParticipantRole = "student" | "teacher";

export type Participant = {
  id: string;
  displayName: string;
  role: ParticipantRole;
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
