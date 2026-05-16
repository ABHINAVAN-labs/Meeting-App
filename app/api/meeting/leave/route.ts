import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { REJOIN_TOKEN_COOKIE_NAME } from "../../../../lib/meetings/constants";
import { leaveMeeting } from "../../../../lib/meetings/service";
import { deriveIpPrefix, hashUserAgent } from "../../../../lib/security/requestContext";
import { invalidateRejoinNonce, validateRejoinTokenForRequest } from "../../../../lib/security/rejoinToken";

export async function DELETE(request: Request) {
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

  invalidateRejoinNonce(validation.claims.nonce);
  await leaveMeeting(validation.claims.meeting_code, validation.claims.participant_id);

  cookieStore.delete(REJOIN_TOKEN_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
