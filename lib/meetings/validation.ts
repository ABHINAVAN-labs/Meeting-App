import { MEETING_CODE_PATTERN, PARTICIPANT_NAME_MAX_LENGTH, PARTICIPANT_NAME_MIN_LENGTH } from "./constants";

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
  if (!/^[\p{L}\p{N} \-]{1,64}$/u.test(normalized)) {
    return null;
  }

  return normalized;
}
