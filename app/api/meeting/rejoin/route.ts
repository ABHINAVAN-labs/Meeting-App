import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { REJOIN_TOKEN_COOKIE_NAME, REJOIN_TOKEN_TTL_SECONDS } from "../../../../lib/meetings/constants";
import { deriveIpPrefix, hashUserAgent } from "../../../../lib/security/requestContext";
import { createRejoinNonce, issueRejoinToken, redeemRejoinToken, validateRejoinTokenForRequest } from "../../../../lib/security/rejoinToken";
import { getParticipantForMeeting, updateParticipantRejoinNonce } from "../../../../lib/meetings/service";
import { getMeetingBanStatusFromRequest } from "../../../../lib/security/banCookie";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(REJOIN_TOKEN_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "join_failed", code: "unauthorized" }, { status: 401 });
  }

  const ipPrefix = deriveIpPrefix(request);
  const uaHash = hashUserAgent(request);
  const validation = await validateRejoinTokenForRequest(token, { ipPrefix, uaHash });
  if (!validation.ok) {
    return NextResponse.json({ error: "join_failed", code: "unauthorized" }, { status: 401 });
  }

  const banStatus = getMeetingBanStatusFromRequest(request, validation.claims.meeting_code);
  if (banStatus.expired) {
    cookieStore.delete(banStatus.cookieName);
  } else if (banStatus.active) {
    return NextResponse.json({ error: "join_failed", code: "unauthorized" }, { status: 401 });
  }

  const redemption = await redeemRejoinToken(token, { ipPrefix, uaHash });

  if (!redemption.ok) {
    return NextResponse.json({ error: "join_failed", code: "unauthorized" }, { status: 401 });
  }

  const participant = await getParticipantForMeeting(redemption.claims.meeting_code, redemption.claims.participant_id);
  if (!participant) {
    return NextResponse.json({ error: "join_failed", code: "unauthorized" }, { status: 401 });
  }

  const nextNonce = createRejoinNonce();
  await updateParticipantRejoinNonce(redemption.claims.meeting_code, redemption.claims.participant_id, nextNonce);

  const issued = await issueRejoinToken({
    participantId: redemption.claims.participant_id,
    meetingCode: redemption.claims.meeting_code,
    role: redemption.claims.role,
    uaHash,
    ipPrefix,
    nonce: nextNonce
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
    participant_id: participant.id,
    meeting_code: participant ? redemption.claims.meeting_code : "",
    role: participant.role,
    expires_at: participant.expiresAt
  });
}
