import type { AttendanceRecord, AttendanceState, HostControls, Participant, ParticipantRole, ParticipantStatus } from "./types";
import type { MeetingRecord, MeetingRepository } from "./repository";

function logParityMismatch(operation: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  if (process.env.MEETING_DB_PARITY_LOGS === "0") {
    return;
  }

  console.warn("[meeting-db-parity-mismatch]", {
    operation,
    ...details
  });
}

function isIsoTimeEquivalent(a: string, b: string): boolean {
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) {
    return a === b;
  }
  return Math.abs(aMs - bMs) < 1000;
}

function isParticipantEqual(a: Participant | null, b: Participant | null): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }

  return (
    a.id === b.id &&
    a.displayNameHash === b.displayNameHash &&
    a.role === b.role &&
    a.status === b.status &&
    a.handRaised === b.handRaised &&
    a.handRaisedAt === b.handRaisedAt &&
    a.uuidv7Nonce === b.uuidv7Nonce &&
    a.active === b.active &&
    a.rejoinNonce === b.rejoinNonce &&
    a.ipPrefix === b.ipPrefix &&
    a.uaHash === b.uaHash &&
    isIsoTimeEquivalent(a.expiresAt, b.expiresAt)
  );
}

function isHostControlsEqual(a: HostControls, b: HostControls): boolean {
  return (
    a.muteAllRequestId === b.muteAllRequestId &&
    a.forceStudentCamerasOn === b.forceStudentCamerasOn &&
    a.vivaTimeEnabled === b.vivaTimeEnabled &&
    a.meetingChatEnabled === b.meetingChatEnabled
  );
}

function isAttendanceStateEqual(a: AttendanceState, b: AttendanceState): boolean {
  return (
    a.thresholdPercent === b.thresholdPercent &&
    a.trackingStartedAt === b.trackingStartedAt &&
    a.endedAt === b.endedAt &&
    a.records.length === b.records.length &&
    a.summary.length === b.summary.length
  );
}

export class DualWriteMeetingRepository implements MeetingRepository {
  constructor(
    private readonly primary: MeetingRepository,
    private readonly secondary?: MeetingRepository
  ) {}

  private shouldReadFromPrimary(): boolean {
    return process.env.MEETING_DB_READ_PRIMARY === "1";
  }

  async ensureMeeting(meetingCode: string): Promise<MeetingRecord> {
    if (!this.secondary) {
      return this.primary.ensureMeeting(meetingCode);
    }
    const [primary, secondary] = await Promise.all([
      this.primary.ensureMeeting(meetingCode),
      this.secondary.ensureMeeting(meetingCode)
    ]);
    if (primary.meetingCode !== secondary.meetingCode) {
      logParityMismatch("ensureMeeting", { meetingCode });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }

  async upsertParticipant(meetingCode: string, participant: Participant): Promise<Participant> {
    if (!this.secondary) {
      return this.primary.upsertParticipant(meetingCode, participant);
    }
    const [primary, secondary] = await Promise.all([
      this.primary.upsertParticipant(meetingCode, participant),
      this.secondary.upsertParticipant(meetingCode, participant)
    ]);
    if (!isParticipantEqual(primary, secondary)) {
      logParityMismatch("upsertParticipant", { meetingCode, participantId: participant.id });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }

  async touchParticipant(meetingCode: string, participantId: string, lastSeenAt: number): Promise<void> {
    if (!this.secondary) {
      await this.primary.touchParticipant(meetingCode, participantId, lastSeenAt);
      return;
    }
    await Promise.all([
      this.primary.touchParticipant(meetingCode, participantId, lastSeenAt),
      this.secondary.touchParticipant(meetingCode, participantId, lastSeenAt)
    ]);
  }

  async getParticipant(meetingCode: string, participantId: string): Promise<Participant | null> {
    if (!this.secondary) {
      return this.primary.getParticipant(meetingCode, participantId);
    }

    const [primary, secondary] = await Promise.all([
      this.primary.getParticipant(meetingCode, participantId),
      this.secondary.getParticipant(meetingCode, participantId)
    ]);
    if (!isParticipantEqual(primary, secondary)) {
      logParityMismatch("getParticipant", { meetingCode, participantId });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }

  async getParticipants(meetingCode: string): Promise<Participant[]> {
    if (!this.secondary) {
      return this.primary.getParticipants(meetingCode);
    }

    const [primary, secondary] = await Promise.all([
      this.primary.getParticipants(meetingCode),
      this.secondary.getParticipants(meetingCode)
    ]);
    if (primary.length !== secondary.length) {
      logParityMismatch("getParticipants:length", { meetingCode, primary: primary.length, secondary: secondary.length });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }

  async countRole(meetingCode: string, role: ParticipantRole, excludeStatus?: ParticipantStatus): Promise<number> {
    if (!this.secondary) {
      return this.primary.countRole(meetingCode, role, excludeStatus);
    }

    const [primary, secondary] = await Promise.all([
      this.primary.countRole(meetingCode, role, excludeStatus),
      this.secondary.countRole(meetingCode, role, excludeStatus)
    ]);
    if (primary !== secondary) {
      logParityMismatch("countRole", { meetingCode, role, primary, secondary });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }

  async updateParticipantStatus(
    meetingCode: string,
    participantId: string,
    status: ParticipantStatus
  ): Promise<Participant | null> {
    if (!this.secondary) {
      return this.primary.updateParticipantStatus(meetingCode, participantId, status);
    }

    const [primary, secondary] = await Promise.all([
      this.primary.updateParticipantStatus(meetingCode, participantId, status),
      this.secondary.updateParticipantStatus(meetingCode, participantId, status)
    ]);
    if (!isParticipantEqual(primary, secondary)) {
      logParityMismatch("updateParticipantStatus", { meetingCode, participantId, status });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }

  async updateParticipantHandRaised(
    meetingCode: string,
    participantId: string,
    handRaised: boolean,
    handRaisedAt: number | null,
    lastSeenAt: number
  ): Promise<Participant | null> {
    if (!this.secondary) {
      return this.primary.updateParticipantHandRaised(meetingCode, participantId, handRaised, handRaisedAt, lastSeenAt);
    }

    const [primary, secondary] = await Promise.all([
      this.primary.updateParticipantHandRaised(meetingCode, participantId, handRaised, handRaisedAt, lastSeenAt),
      this.secondary.updateParticipantHandRaised(meetingCode, participantId, handRaised, handRaisedAt, lastSeenAt)
    ]);
    if (!isParticipantEqual(primary, secondary)) {
      logParityMismatch("updateParticipantHandRaised", { meetingCode, participantId, handRaised });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }

  async removeParticipant(meetingCode: string, participantId: string): Promise<boolean> {
    if (!this.secondary) {
      return this.primary.removeParticipant(meetingCode, participantId);
    }

    const [primary, secondary] = await Promise.all([
      this.primary.removeParticipant(meetingCode, participantId),
      this.secondary.removeParticipant(meetingCode, participantId)
    ]);
    if (primary !== secondary) {
      logParityMismatch("removeParticipant", { meetingCode, participantId, primary, secondary });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }

  async isParticipantSessionBanned(meetingCode: string, participantId: string): Promise<boolean> {
    if (!this.secondary) {
      return this.primary.isParticipantSessionBanned(meetingCode, participantId);
    }
    const [primary, secondary] = await Promise.all([
      this.primary.isParticipantSessionBanned(meetingCode, participantId),
      this.secondary.isParticipantSessionBanned(meetingCode, participantId)
    ]);
    if (primary !== secondary) {
      logParityMismatch("isParticipantSessionBanned", { meetingCode, participantId, primary, secondary });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }

  async banParticipantSession(
    meetingCode: string,
    participantId: string,
    bannedByParticipantId: string
  ): Promise<void> {
    if (!this.secondary) {
      await this.primary.banParticipantSession(meetingCode, participantId, bannedByParticipantId);
      return;
    }
    await Promise.all([
      this.primary.banParticipantSession(meetingCode, participantId, bannedByParticipantId),
      this.secondary.banParticipantSession(meetingCode, participantId, bannedByParticipantId)
    ]);
  }

  async getHostControls(meetingCode: string): Promise<HostControls> {
    if (!this.secondary) {
      return this.primary.getHostControls(meetingCode);
    }

    const [primary, secondary] = await Promise.all([
      this.primary.getHostControls(meetingCode),
      this.secondary.getHostControls(meetingCode)
    ]);
    if (!isHostControlsEqual(primary, secondary)) {
      logParityMismatch("getHostControls", { meetingCode });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }

  async updateHostControls(meetingCode: string, updates: Partial<HostControls>): Promise<HostControls> {
    if (!this.secondary) {
      return this.primary.updateHostControls(meetingCode, updates);
    }

    const [primary, secondary] = await Promise.all([
      this.primary.updateHostControls(meetingCode, updates),
      this.secondary.updateHostControls(meetingCode, updates)
    ]);
    if (!isHostControlsEqual(primary, secondary)) {
      logParityMismatch("updateHostControls", { meetingCode, updates });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }

  async getAttendanceState(meetingCode: string): Promise<AttendanceState> {
    if (!this.secondary) {
      return this.primary.getAttendanceState(meetingCode);
    }

    const [primary, secondary] = await Promise.all([
      this.primary.getAttendanceState(meetingCode),
      this.secondary.getAttendanceState(meetingCode)
    ]);
    if (!isAttendanceStateEqual(primary, secondary)) {
      logParityMismatch("getAttendanceState", { meetingCode });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }

  async upsertAttendanceRecord(meetingCode: string, record: AttendanceRecord): Promise<void> {
    if (!this.secondary) {
      await this.primary.upsertAttendanceRecord(meetingCode, record);
      return;
    }
    await Promise.all([
      this.primary.upsertAttendanceRecord(meetingCode, record),
      this.secondary.upsertAttendanceRecord(meetingCode, record)
    ]);
  }

  async updateAttendanceState(
    meetingCode: string,
    updates: Partial<Pick<AttendanceState, "thresholdPercent" | "trackingStartedAt" | "endedAt" | "summary">>
  ): Promise<AttendanceState> {
    if (!this.secondary) {
      return this.primary.updateAttendanceState(meetingCode, updates);
    }

    const [primary, secondary] = await Promise.all([
      this.primary.updateAttendanceState(meetingCode, updates),
      this.secondary.updateAttendanceState(meetingCode, updates)
    ]);
    if (!isAttendanceStateEqual(primary, secondary)) {
      logParityMismatch("updateAttendanceState", { meetingCode });
    }
    return this.shouldReadFromPrimary() ? primary : secondary;
  }
}
