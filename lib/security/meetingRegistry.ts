import { DEFAULT_MEETING_TTL_SECONDS } from "../meetings/constants";
import type { ParticipantRole } from "../meetings/types";

export type MeetingRegistryRecord = {
  meeting_code: string;
  allowed_roles: ParticipantRole[];
  host_id: string;
  max_participants: number;
  created_at: string;
  expires_at: string;
};

const registry = new Map<string, MeetingRegistryRecord>();

function nowIso(): string {
  return new Date().toISOString();
}

export function purgeExpiredMeetings(referenceTs: number = Date.now()): void {
  for (const [meetingCode, record] of registry.entries()) {
    const expiresAt = Date.parse(record.expires_at);
    if (Number.isNaN(expiresAt) || expiresAt <= referenceTs) {
      registry.delete(meetingCode);
    }
  }
}

export function getMeetingRegistryRecord(meetingCode: string): MeetingRegistryRecord | null {
  purgeExpiredMeetings();
  return registry.get(meetingCode) ?? null;
}

export function ensureMeetingRegistryRecord(
  meetingCode: string,
  hostId: string,
  options?: { maxParticipants?: number; ttlSeconds?: number }
): MeetingRegistryRecord {
  purgeExpiredMeetings();
  const existing = registry.get(meetingCode);
  if (existing) {
    return existing;
  }

  const createdAt = nowIso();
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_MEETING_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const created: MeetingRegistryRecord = {
    meeting_code: meetingCode,
    allowed_roles: ["teacher", "student"],
    host_id: hostId,
    max_participants: options?.maxParticipants ?? 120,
    created_at: createdAt,
    expires_at: expiresAt
  };

  registry.set(meetingCode, created);
  return created;
}
