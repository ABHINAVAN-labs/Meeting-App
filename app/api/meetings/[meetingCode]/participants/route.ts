import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/meetings/constants";
import { listRoomParticipants } from "../../../../../lib/meetings/service";
import { parseSessionCookie } from "../../../../../lib/meetings/session";
import { normalizeMeetingCode } from "../../../../../lib/meetings/validation";

export async function GET(
  _: Request,
  context: { params: Promise<{ meetingCode: string }> }
) {
  const { meetingCode } = await context.params;
  const normalizedCode = normalizeMeetingCode(meetingCode);

  if (!normalizedCode) {
    return NextResponse.json({ message: "Invalid meeting code." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!session || session.meetingCode !== normalizedCode) {
    return NextResponse.json({ message: "Join this meeting from lobby first." }, { status: 403 });
  }

  const participants = listRoomParticipants(normalizedCode, session.participantId);
  return NextResponse.json({ participants, sessionParticipantId: session.participantId });
}
