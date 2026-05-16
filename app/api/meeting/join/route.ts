import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { joinMeeting } from "../../../../lib/meetings/service";
import { REJOIN_TOKEN_COOKIE_NAME, REJOIN_TOKEN_TTL_SECONDS } from "../../../../lib/meetings/constants";
import type { JoinMeetingRequest } from "../../../../lib/meetings/types";
import { deriveIpPrefix, hashUserAgent } from "../../../../lib/security/requestContext";
import { issueRejoinToken } from "../../../../lib/security/rejoinToken";
import { getMeetingBanStatusFromRequest } from "../../../../lib/security/banCookie";
import { normalizeMeetingCode } from "../../../../lib/meetings/validation";

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<JoinMeetingRequest> & {
    meeting_code?: string;
    display_name?: string;
  };
  const ipPrefix = deriveIpPrefix(request);
  const uaHash = hashUserAgent(request);
  const normalizedMeetingCode = normalizeMeetingCode(payload.meetingCode ?? payload.meeting_code ?? "");
  const cookieStore = await cookies();

  if (normalizedMeetingCode) {
    const banStatus = getMeetingBanStatusFromRequest(request, normalizedMeetingCode);
    if (banStatus.expired) {
      cookieStore.delete(banStatus.cookieName);
    } else if (banStatus.active) {
      return NextResponse.json({ error: "join_failed", code: "unauthorized" }, { status: 401 });
    }
  }

  const result = await joinMeeting(
    {
      meetingCode: payload.meetingCode ?? payload.meeting_code ?? "",
      displayName: payload.displayName ?? payload.display_name ?? "",
      role: payload.role === "teacher" ? "teacher" : "student"
    },
    {
      ipPrefix,
      uaHash
    }
  );

  if (!result.ok) {
    const status = result.status ?? 400;
    const code = status === 429 ? "rate_limited" : status === 401 ? "unauthorized" : "invalid_request";
    return NextResponse.json(
      { error: "join_failed", code },
      {
        status,
        headers: status === 429 ? { "Retry-After": "1" } : undefined
      }
    );
  }

  const issued = await issueRejoinToken({
    participantId: result.participant.id,
    meetingCode: result.meetingCode,
    role: result.participant.role,
    uaHash,
    ipPrefix,
    nonce: result.participant.rejoinNonce ?? undefined
  });

  cookieStore.set({
    name: REJOIN_TOKEN_COOKIE_NAME,
    value: issued.token,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: REJOIN_TOKEN_TTL_SECONDS
  });

  return NextResponse.json({
    participant_id: result.participant.id,
    meeting_code: result.meetingCode,
    role: result.participant.role,
    expires_at: result.participant.expiresAt
  });
}
