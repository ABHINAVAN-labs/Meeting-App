import { deriveIpPrefix, hashUserAgent } from "../security/requestContext";
import { validateRejoinTokenForRequest } from "../security/rejoinToken";

export type SessionCookie = {
  meetingCode: string;
  participantId: string;
  role: "teacher" | "student";
  nonce: string;
};

export async function parseSessionCookie(value: string | undefined, request: Request): Promise<SessionCookie | null> {
  if (!value) {
    return null;
  }

  try {
    const ipPrefix = deriveIpPrefix(request);
    const uaHash = hashUserAgent(request);
    const validation = await validateRejoinTokenForRequest(value, { uaHash, ipPrefix });
    if (!validation.ok) {
      return null;
    }

    return {
      meetingCode: validation.claims.meeting_code,
      participantId: validation.claims.participant_id,
      role: validation.claims.role,
      nonce: validation.claims.nonce
    };
  } catch {
    return null;
  }
}
