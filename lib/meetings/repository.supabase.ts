import { getSupabaseServiceClient } from "../supabaseServer";
import type {
  AttendanceRecord,
  AttendanceState,
  AttendanceSummaryEntry,
  HostControls,
  Participant,
  ParticipantRole,
  ParticipantStatus
} from "./types";
import type { MeetingRecord, MeetingRepository } from "./repository";

type DbParticipantRow = {
  participant_id: string;
  meeting_code: string;
  display_name: string | null;
  display_name_hash: string | null;
  role: ParticipantRole;
  status: ParticipantStatus;
  hand_raised: boolean;
  hand_raised_at: number | null;
  joined_at_ms: number;
  last_seen_at_ms: number;
  uuidv7_nonce: string | null;
  active: boolean | null;
  rejoin_nonce: string | null;
  ip_prefix: string | null;
  ua_hash: string | null;
  expires_at: string | null;
};

type DbMeetingRow = {
  meeting_code: string;
  created_at: string;
  updated_at: string;
};

type DbHostControlsRow = {
  meeting_code: string;
  mute_all_request_id: number;
  force_student_cameras_on: boolean;
  viva_time_enabled: boolean;
  meeting_chat_enabled: boolean;
  updated_at: string;
};

type DbAttendanceStateRow = {
  meeting_code: string;
  threshold_percent: number | null;
  tracking_started_at_ms: number | null;
  ended_at_ms: number | null;
  summary: AttendanceSummaryEntry[] | null;
};

type DbAttendanceRecordRow = {
  participant_id: string;
  meeting_code: string;
  display_name: string;
  role: "student";
  joined_at_ms: number;
  active_from_ms: number | null;
  attended_ms: number;
  banned: boolean;
  last_seen_at_ms: number;
};

const DEFAULT_HOST_CONTROLS: HostControls = {
  muteAllRequestId: 0,
  forceStudentCamerasOn: false,
  vivaTimeEnabled: false,
  meetingChatEnabled: false
};

function toParticipant(row: DbParticipantRow): Participant {
  return {
    id: row.participant_id,
    displayName: row.display_name ?? "[redacted]",
    displayNameHash: row.display_name_hash ?? "",
    role: row.role,
    status: row.status,
    handRaised: row.hand_raised,
    handRaisedAt: row.hand_raised_at,
    joinedAt: row.joined_at_ms,
    lastSeenAt: row.last_seen_at_ms,
    uuidv7Nonce: row.uuidv7_nonce ?? "",
    active: row.active ?? true,
    rejoinNonce: row.rejoin_nonce ?? null,
    ipPrefix: row.ip_prefix ?? "0.0.0.0/24",
    uaHash: row.ua_hash ?? "",
    expiresAt: row.expires_at ?? new Date(0).toISOString()
  };
}

function toHostControls(row: DbHostControlsRow | null | undefined): HostControls {
  if (!row) {
    return { ...DEFAULT_HOST_CONTROLS };
  }

  return {
    muteAllRequestId: row.mute_all_request_id,
    forceStudentCamerasOn: row.force_student_cameras_on,
    vivaTimeEnabled: row.viva_time_enabled,
    meetingChatEnabled: row.meeting_chat_enabled
  };
}

function toAttendanceRecord(row: DbAttendanceRecordRow): AttendanceRecord {
  return {
    participantId: row.participant_id,
    displayName: row.display_name,
    role: row.role,
    joinedAt: row.joined_at_ms,
    activeFrom: row.active_from_ms,
    attendedMs: row.attended_ms,
    banned: row.banned,
    lastSeenAt: row.last_seen_at_ms
  };
}

function toAttendanceState(row: DbAttendanceStateRow | null | undefined, records: AttendanceRecord[]): AttendanceState {
  return {
    thresholdPercent: row?.threshold_percent ?? null,
    trackingStartedAt: row?.tracking_started_at_ms ?? null,
    endedAt: row?.ended_at_ms ?? null,
    records,
    summary: row?.summary ?? []
  };
}

export class SupabaseMeetingRepository implements MeetingRepository {
  private readonly client = getSupabaseServiceClient();

  private assertClient() {
    if (!this.client) {
      throw new Error("Supabase service client is not configured.");
    }
    return this.client;
  }

  async ensureMeeting(meetingCode: string): Promise<MeetingRecord> {
    const client = this.assertClient();

    const now = new Date().toISOString();
    const { error: upsertError } = await client.from("meetings").upsert(
      {
        meeting_code: meetingCode,
        updated_at: now
      },
      { onConflict: "meeting_code" }
    );

    if (upsertError) {
      throw upsertError;
    }

    const { data, error } = await client
      .from("meetings")
      .select("meeting_code,created_at,updated_at")
      .eq("meeting_code", meetingCode)
      .single<DbMeetingRow>();

    if (error || !data) {
      throw error ?? new Error("Meeting lookup failed.");
    }

    return {
      meetingCode: data.meeting_code,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async upsertParticipant(meetingCode: string, participant: Participant): Promise<Participant> {
    const client = this.assertClient();

    await this.ensureMeeting(meetingCode);

    const { error } = await client.from("participants").upsert(
      {
        participant_id: participant.id,
        meeting_code: meetingCode,
        // SECURITY NOTE: plaintext display name is intentionally redacted in persistent storage.
        display_name: "[redacted]",
        display_name_hash: participant.displayNameHash,
        role: participant.role,
        status: participant.status,
        hand_raised: participant.handRaised,
        hand_raised_at: participant.handRaisedAt,
        joined_at_ms: participant.joinedAt,
        last_seen_at_ms: participant.lastSeenAt,
        uuidv7_nonce: participant.uuidv7Nonce,
        active: participant.active,
        rejoin_nonce: participant.rejoinNonce,
        ip_prefix: participant.ipPrefix,
        ua_hash: participant.uaHash,
        expires_at: participant.expiresAt
      },
      { onConflict: "participant_id" }
    );

    if (error) {
      throw error;
    }

    return participant;
  }

  async touchParticipant(meetingCode: string, participantId: string, lastSeenAt: number): Promise<void> {
    const client = this.assertClient();
    const { error } = await client
      .from("participants")
      .update({ last_seen_at_ms: lastSeenAt })
      .eq("meeting_code", meetingCode)
      .eq("participant_id", participantId);

    if (error) {
      throw error;
    }
  }

  async getParticipant(meetingCode: string, participantId: string): Promise<Participant | null> {
    const client = this.assertClient();
    const { data, error } = await client
      .from("participants")
      .select(
        "participant_id,meeting_code,display_name,display_name_hash,role,status,hand_raised,hand_raised_at,joined_at_ms,last_seen_at_ms,uuidv7_nonce,active,rejoin_nonce,ip_prefix,ua_hash,expires_at"
      )
      .eq("meeting_code", meetingCode)
      .eq("participant_id", participantId)
      .maybeSingle<DbParticipantRow>();

    if (error) {
      throw error;
    }

    return data ? toParticipant(data) : null;
  }

  async getParticipants(meetingCode: string): Promise<Participant[]> {
    const client = this.assertClient();
    const { data, error } = await client
      .from("participants")
      .select(
        "participant_id,meeting_code,display_name,display_name_hash,role,status,hand_raised,hand_raised_at,joined_at_ms,last_seen_at_ms,uuidv7_nonce,active,rejoin_nonce,ip_prefix,ua_hash,expires_at"
      )
      .eq("meeting_code", meetingCode)
      .order("joined_at_ms", { ascending: true })
      .returns<DbParticipantRow[]>();

    if (error) {
      throw error;
    }

    return (data ?? []).map(toParticipant);
  }

  async countRole(meetingCode: string, role: ParticipantRole, excludeStatus: ParticipantStatus = "rejected"): Promise<number> {
    const client = this.assertClient();
    const { count, error } = await client
      .from("participants")
      .select("participant_id", { count: "exact", head: true })
      .eq("meeting_code", meetingCode)
      .eq("role", role)
      .neq("status", excludeStatus);

    if (error) {
      throw error;
    }

    return count ?? 0;
  }

  async updateParticipantStatus(
    meetingCode: string,
    participantId: string,
    status: ParticipantStatus
  ): Promise<Participant | null> {
    const client = this.assertClient();
    const now = Date.now();
    const { data, error } = await client
      .from("participants")
      .update({ status, last_seen_at_ms: now })
      .eq("meeting_code", meetingCode)
      .eq("participant_id", participantId)
      .select(
        "participant_id,meeting_code,display_name,display_name_hash,role,status,hand_raised,hand_raised_at,joined_at_ms,last_seen_at_ms,uuidv7_nonce,active,rejoin_nonce,ip_prefix,ua_hash,expires_at"
      )
      .maybeSingle<DbParticipantRow>();

    if (error) {
      throw error;
    }

    return data ? toParticipant(data) : null;
  }

  async updateParticipantHandRaised(
    meetingCode: string,
    participantId: string,
    handRaised: boolean,
    handRaisedAt: number | null,
    lastSeenAt: number
  ): Promise<Participant | null> {
    const client = this.assertClient();
    const { data, error } = await client
      .from("participants")
      .update({ hand_raised: handRaised, hand_raised_at: handRaisedAt, last_seen_at_ms: lastSeenAt })
      .eq("meeting_code", meetingCode)
      .eq("participant_id", participantId)
      .select(
        "participant_id,meeting_code,display_name,display_name_hash,role,status,hand_raised,hand_raised_at,joined_at_ms,last_seen_at_ms,uuidv7_nonce,active,rejoin_nonce,ip_prefix,ua_hash,expires_at"
      )
      .maybeSingle<DbParticipantRow>();

    if (error) {
      throw error;
    }

    return data ? toParticipant(data) : null;
  }

  async removeParticipant(meetingCode: string, participantId: string): Promise<boolean> {
    const client = this.assertClient();
    const { error, count } = await client
      .from("participants")
      .delete({ count: "exact" })
      .eq("meeting_code", meetingCode)
      .eq("participant_id", participantId);

    if (error) {
      throw error;
    }

    return (count ?? 0) > 0;
  }

  async isParticipantSessionBanned(meetingCode: string, participantId: string): Promise<boolean> {
    const client = this.assertClient();
    const { count, error } = await client
      .from("meeting_bans")
      .select("meeting_code", { count: "exact", head: true })
      .eq("meeting_code", meetingCode)
      .eq("identity_type", "participant_session")
      .eq("identity_hash", participantId);

    if (error) {
      throw error;
    }

    return (count ?? 0) > 0;
  }

  async banParticipantSession(
    meetingCode: string,
    participantId: string,
    bannedByParticipantId: string
  ): Promise<void> {
    const client = this.assertClient();
    const { error } = await client.from("meeting_bans").upsert(
      {
        meeting_code: meetingCode,
        identity_type: "participant_session",
        identity_hash: participantId,
        banned_by_participant_id: bannedByParticipantId
      },
      { onConflict: "meeting_code,identity_hash" }
    );
    if (error) {
      throw error;
    }
  }

  async getHostControls(meetingCode: string): Promise<HostControls> {
    const client = this.assertClient();
    await this.ensureMeeting(meetingCode);

    const { data, error } = await client
      .from("host_controls")
      .select("meeting_code,mute_all_request_id,force_student_cameras_on,viva_time_enabled,meeting_chat_enabled,updated_at")
      .eq("meeting_code", meetingCode)
      .maybeSingle<DbHostControlsRow>();

    if (error) {
      throw error;
    }

    if (!data) {
      const { error: insertError } = await client.from("host_controls").insert({ meeting_code: meetingCode });
      if (insertError) {
        throw insertError;
      }
      return { ...DEFAULT_HOST_CONTROLS };
    }

    return toHostControls(data);
  }

  async updateHostControls(meetingCode: string, updates: Partial<HostControls>): Promise<HostControls> {
    const client = this.assertClient();

    const current = await this.getHostControls(meetingCode);
    const next: HostControls = {
      ...current,
      ...updates
    };

    const { error } = await client.from("host_controls").upsert(
      {
        meeting_code: meetingCode,
        mute_all_request_id: next.muteAllRequestId,
        force_student_cameras_on: next.forceStudentCamerasOn,
        viva_time_enabled: next.vivaTimeEnabled,
        meeting_chat_enabled: next.meetingChatEnabled,
        updated_at: new Date().toISOString()
      },
      { onConflict: "meeting_code" }
    );

    if (error) {
      throw error;
    }

    return next;
  }

  async getAttendanceState(meetingCode: string): Promise<AttendanceState> {
    const client = this.assertClient();
    await this.ensureMeeting(meetingCode);

    const [{ data: state, error: stateError }, { data: records, error: recordsError }] = await Promise.all([
      client
        .from("meeting_attendance_state")
        .select("meeting_code,threshold_percent,tracking_started_at_ms,ended_at_ms,summary")
        .eq("meeting_code", meetingCode)
        .maybeSingle<DbAttendanceStateRow>(),
      client
        .from("meeting_attendance_records")
        .select("participant_id,meeting_code,display_name,role,joined_at_ms,active_from_ms,attended_ms,banned,last_seen_at_ms")
        .eq("meeting_code", meetingCode)
        .order("joined_at_ms", { ascending: true })
        .returns<DbAttendanceRecordRow[]>()
    ]);

    if (stateError) {
      throw stateError;
    }
    if (recordsError) {
      throw recordsError;
    }

    return toAttendanceState(state, (records ?? []).map(toAttendanceRecord));
  }

  async upsertAttendanceRecord(meetingCode: string, record: AttendanceRecord): Promise<void> {
    const client = this.assertClient();
    await this.ensureMeeting(meetingCode);

    const { error } = await client.from("meeting_attendance_records").upsert(
      {
        meeting_code: meetingCode,
        participant_id: record.participantId,
        display_name: record.displayName,
        role: record.role,
        joined_at_ms: record.joinedAt,
        active_from_ms: record.activeFrom,
        attended_ms: record.attendedMs,
        banned: record.banned,
        last_seen_at_ms: record.lastSeenAt
      },
      { onConflict: "meeting_code,participant_id" }
    );

    if (error) {
      throw error;
    }
  }

  async updateAttendanceState(
    meetingCode: string,
    updates: Partial<Pick<AttendanceState, "thresholdPercent" | "trackingStartedAt" | "endedAt" | "summary">>
  ): Promise<AttendanceState> {
    const client = this.assertClient();
    const current = await this.getAttendanceState(meetingCode);
    const next = {
      threshold_percent: updates.thresholdPercent ?? current.thresholdPercent,
      tracking_started_at_ms: updates.trackingStartedAt ?? current.trackingStartedAt,
      ended_at_ms: updates.endedAt ?? current.endedAt,
      summary: updates.summary ?? current.summary
    };

    const { error } = await client.from("meeting_attendance_state").upsert(
      {
        meeting_code: meetingCode,
        ...next,
        updated_at: new Date().toISOString()
      },
      { onConflict: "meeting_code" }
    );

    if (error) {
      throw error;
    }

    return {
      thresholdPercent: next.threshold_percent,
      trackingStartedAt: next.tracking_started_at_ms,
      endedAt: next.ended_at_ms,
      records: current.records,
      summary: next.summary
    };
  }
}
