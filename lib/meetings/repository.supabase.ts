import { getSupabaseServiceClient } from "../supabaseServer";
import type { HostControls, JoinIdentityType, Participant, ParticipantRole, ParticipantStatus } from "./types";
import type { MeetingRecord, MeetingRepository } from "./repository";

type DbParticipantRow = {
  participant_id: string;
  meeting_code: string;
  display_name: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  join_identity_type: JoinIdentityType | null;
  join_identity_hash: string | null;
  hand_raised: boolean;
  hand_raised_at: number | null;
  joined_at_ms: number;
  last_seen_at_ms: number;
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

const DEFAULT_HOST_CONTROLS: HostControls = {
  muteAllRequestId: 0,
  forceStudentCamerasOn: false,
  vivaTimeEnabled: false,
  meetingChatEnabled: false
};

function toParticipant(row: DbParticipantRow): Participant {
  return {
    id: row.participant_id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    joinIdentityType: row.join_identity_type,
    joinIdentityHash: row.join_identity_hash,
    handRaised: row.hand_raised,
    handRaisedAt: row.hand_raised_at,
    joinedAt: row.joined_at_ms,
    lastSeenAt: row.last_seen_at_ms
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
        display_name: participant.displayName,
        role: participant.role,
        status: participant.status,
        join_identity_type: participant.joinIdentityType,
        join_identity_hash: participant.joinIdentityHash,
        hand_raised: participant.handRaised,
        hand_raised_at: participant.handRaisedAt,
        joined_at_ms: participant.joinedAt,
        last_seen_at_ms: participant.lastSeenAt
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
      .select("participant_id,meeting_code,display_name,role,status,join_identity_type,join_identity_hash,hand_raised,hand_raised_at,joined_at_ms,last_seen_at_ms")
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
      .select("participant_id,meeting_code,display_name,role,status,join_identity_type,join_identity_hash,hand_raised,hand_raised_at,joined_at_ms,last_seen_at_ms")
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
      .select("participant_id,meeting_code,display_name,role,status,join_identity_type,join_identity_hash,hand_raised,hand_raised_at,joined_at_ms,last_seen_at_ms")
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
      .select("participant_id,meeting_code,display_name,role,status,join_identity_type,join_identity_hash,hand_raised,hand_raised_at,joined_at_ms,last_seen_at_ms")
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

  async isIdentityBanned(meetingCode: string, identityHash: string): Promise<boolean> {
    const client = this.assertClient();
    const { count, error } = await client
      .from("meeting_bans")
      .select("meeting_code", { count: "exact", head: true })
      .eq("meeting_code", meetingCode)
      .eq("identity_hash", identityHash);

    if (error) {
      throw error;
    }

    return (count ?? 0) > 0;
  }

  async banIdentity(
    meetingCode: string,
    identityType: JoinIdentityType,
    identityHash: string,
    bannedByParticipantId: string
  ): Promise<void> {
    const client = this.assertClient();
    const { error } = await client.from("meeting_bans").upsert(
      {
        meeting_code: meetingCode,
        identity_type: identityType,
        identity_hash: identityHash,
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
}
