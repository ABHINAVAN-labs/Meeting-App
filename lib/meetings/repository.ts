import type { HostControls, Participant, ParticipantRole, ParticipantStatus } from "./types";

export type MeetingRecord = {
  meetingCode: string;
  createdAt: string;
  updatedAt: string;
};

export interface MeetingRepository {
  ensureMeeting(meetingCode: string): Promise<MeetingRecord>;
  upsertParticipant(meetingCode: string, participant: Participant): Promise<Participant>;
  touchParticipant(meetingCode: string, participantId: string, lastSeenAt: number): Promise<void>;
  getParticipant(meetingCode: string, participantId: string): Promise<Participant | null>;
  getParticipants(meetingCode: string): Promise<Participant[]>;
  countRole(meetingCode: string, role: ParticipantRole, excludeStatus?: ParticipantStatus): Promise<number>;
  updateParticipantStatus(meetingCode: string, participantId: string, status: ParticipantStatus): Promise<Participant | null>;
  updateParticipantHandRaised(
    meetingCode: string,
    participantId: string,
    handRaised: boolean,
    handRaisedAt: number | null,
    lastSeenAt: number
  ): Promise<Participant | null>;
  removeParticipant(meetingCode: string, participantId: string): Promise<boolean>;
  isParticipantSessionBanned(meetingCode: string, participantId: string): Promise<boolean>;
  banParticipantSession(meetingCode: string, participantId: string, bannedByParticipantId: string): Promise<void>;
  getHostControls(meetingCode: string): Promise<HostControls>;
  updateHostControls(meetingCode: string, updates: Partial<HostControls>): Promise<HostControls>;
}
