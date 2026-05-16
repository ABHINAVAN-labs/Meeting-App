import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/meetings/constants";
import { leaveMeeting } from "../../../../../lib/meetings/service";
import { parseSessionCookie } from "../../../../../lib/meetings/session";
import { normalizeMeetingCode } from "../../../../../lib/meetings/validation";
import { invalidateRejoinNonce } from "../../../../../lib/security/rejoinToken";

export async function POST(request: Request, context: { params: Promise<{ meetingCode: string }> }) {
  const { meetingCode } = await context.params;
  const normalizedCode = normalizeMeetingCode(meetingCode);

  if (!normalizedCode) {
    return NextResponse.json({ message: "Invalid meeting code." }, { status: 400 });
  }

  const headerParticipantId = request.headers.get("x-participant-id")?.trim() ?? "";
  if (headerParticipantId) {
    await leaveMeeting(normalizedCode, headerParticipantId);
    return NextResponse.json({ ok: true });
  }

  const cookieStore = await cookies();
  const session = await parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value, request);
  if (!session || session.meetingCode !== normalizedCode) {
    return NextResponse.json({ ok: true });
  }

  invalidateRejoinNonce(session.nonce);
  await leaveMeeting(normalizedCode, session.participantId);
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}


