import { MEETING_CODE_PATTERN, PARTICIPANT_NAME_MAX_LENGTH, PARTICIPANT_NAME_MIN_LENGTH } from "./constants";
import type { JoinIdentityType } from "./types";

export function normalizeMeetingCode(rawCode: string): string | null {
  const trimmed = rawCode.trim();
  if (!trimmed) {
    return null;
  }

  const withoutQuery = trimmed.split(/[?#]/)[0] ?? trimmed;
  const lastSegment = withoutQuery.split("/").filter(Boolean).at(-1) ?? withoutQuery;
  const decoded = decodeURIComponent(lastSegment).trim().toUpperCase();

  return isMeetingCodeValid(decoded) ? decoded : null;
}

export function isMeetingCodeValid(meetingCode: string): boolean {
  return MEETING_CODE_PATTERN.test(meetingCode.trim());
}

export function normalizeParticipantName(rawName: string): string | null {
  const normalized = rawName.replace(/\s+/g, " ").trim();

  if (normalized.length < PARTICIPANT_NAME_MIN_LENGTH || normalized.length > PARTICIPANT_NAME_MAX_LENGTH) {
    return null;
  }

  return normalized;
}

function normalizeEmailIdentity(rawValue: string): string | null {
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized || normalized.length > 254) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizePhoneIdentity(rawValue: string): string | null {
  const normalized = rawValue.replace(/[^\d+]/g, "");
  if (!normalized) {
    return null;
  }
  const withPlus = normalized.startsWith("+") ? normalized : `+${normalized}`;
  if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) {
    return null;
  }
  return withPlus;
}

export function normalizeJoinIdentity(type: JoinIdentityType, rawValue: string): string | null {
  if (type === "email") {
    return normalizeEmailIdentity(rawValue);
  }
  return normalizePhoneIdentity(rawValue);
}
