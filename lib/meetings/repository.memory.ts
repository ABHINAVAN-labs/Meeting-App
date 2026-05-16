import type { AttendanceRecord, AttendanceState, HostControls, Participant, ParticipantRole, ParticipantStatus } from "./types";
import type { MeetingRecord, MeetingRepository } from "./repository";
import {
  countRole as countRoleInMemory,
  getAttendanceState,
  getHostControls,
  getParticipant,
  getParticipants,
  removeParticipant,
  touchParticipant,
  updateAttendanceState,
  updateHostControls,
  updateParticipantHandRaised,
  updateParticipantStatus,
  upsertAttendanceRecord,
  upsertParticipant
} from "./store";

const EMPTY_RECORD_TIME = new Date(0).toISOString();
const sessionBansByMeeting = new Map<string, Set<string>>();

function fallbackMeetingRecord(meetingCode: string): MeetingRecord {
  return {
    meetingCode,
    createdAt: EMPTY_RECORD_TIME,
    updatedAt: new Date().toISOString()
  };
}

export class InMemoryMeetingRepository implements MeetingRepository {
  async ensureMeeting(meetingCode: string): Promise<MeetingRecord> {
    getHostControls(meetingCode);
    return fallbackMeetingRecord(meetingCode);
  }

  async upsertParticipant(meetingCode: string, participant: Participant): Promise<Participant> {
    upsertParticipant(meetingCode, participant);
    return participant;
  }

  async touchParticipant(meetingCode: string, participantId: string, _lastSeenAt: number): Promise<void> {
    touchParticipant(meetingCode, participantId);
  }

  async getParticipant(meetingCode: string, participantId: string): Promise<Participant | null> {
    return getParticipant(meetingCode, participantId);
  }

  async getParticipants(meetingCode: string): Promise<Participant[]> {
    return getParticipants(meetingCode);
  }

  async countRole(meetingCode: string, role: ParticipantRole, excludeStatus: ParticipantStatus = "rejected"): Promise<number> {
    if (excludeStatus === "rejected") {
      return countRoleInMemory(meetingCode, role);
    }

    const participants = getParticipants(meetingCode);
    return participants.filter((participant) => participant.role === role && participant.status !== excludeStatus).length;
  }

  async updateParticipantStatus(
    meetingCode: string,
    participantId: string,
    status: ParticipantStatus
  ): Promise<Participant | null> {
    return updateParticipantStatus(meetingCode, participantId, status);
  }

  async updateParticipantHandRaised(
    meetingCode: string,
    participantId: string,
    handRaised: boolean,
    handRaisedAt: number | null,
    _lastSeenAt: number
  ): Promise<Participant | null> {
    const updated = updateParticipantHandRaised(meetingCode, participantId, handRaised);
    if (!updated) {
      return null;
    }
    return {
      ...updated,
      handRaisedAt
    };
  }

  async removeParticipant(meetingCode: string, participantId: string): Promise<boolean> {
    const before = getParticipants(meetingCode).length;
    removeParticipant(meetingCode, participantId);
    const after = getParticipants(meetingCode).length;
    return after < before;
  }

  async isParticipantSessionBanned(meetingCode: string, participantId: string): Promise<boolean> {
    const banned = sessionBansByMeeting.get(meetingCode);
    if (!banned) {
      return false;
    }
    return banned.has(participantId);
  }

  async banParticipantSession(
    meetingCode: string,
    participantId: string,
    _bannedByParticipantId: string
  ): Promise<void> {
    const banned = sessionBansByMeeting.get(meetingCode) ?? new Set<string>();
    banned.add(participantId);
    sessionBansByMeeting.set(meetingCode, banned);
  }

  async getHostControls(meetingCode: string): Promise<HostControls> {
    return getHostControls(meetingCode);
  }

  async updateHostControls(meetingCode: string, updates: Partial<HostControls>): Promise<HostControls> {
    return updateHostControls(meetingCode, updates);
  }

  async getAttendanceState(meetingCode: string): Promise<AttendanceState> {
    return getAttendanceState(meetingCode);
  }

  async upsertAttendanceRecord(meetingCode: string, record: AttendanceRecord): Promise<void> {
    upsertAttendanceRecord(meetingCode, record);
  }

  async updateAttendanceState(
    meetingCode: string,
    updates: Partial<Pick<AttendanceState, "thresholdPercent" | "trackingStartedAt" | "endedAt" | "summary">>
  ): Promise<AttendanceState> {
    return updateAttendanceState(meetingCode, updates);
  }
}
