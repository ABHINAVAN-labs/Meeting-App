import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../../lib/meetings/constants";
import { setAttendanceThreshold } from "../../../../../../lib/meetings/service";
import { parseSessionCookie } from "../../../../../../lib/meetings/session";
import { normalizeMeetingCode } from "../../../../../../lib/meetings/validation";

type ThresholdPayload = {
  thresholdPercent?: number;
};

export async function POST(request: Request, context: { params: Promise<{ meetingCode: string }> }) {
  const { meetingCode } = await context.params;
  const normalizedCode = normalizeMeetingCode(meetingCode);

  if (!normalizedCode) {
    return NextResponse.json({ message: "Invalid meeting code." }, { status: 400 });
  }

  const payload = (await request.json().catch(() => ({}))) as ThresholdPayload;
  const headerParticipantId = request.headers.get("x-participant-id")?.trim() ?? "";
  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const actorParticipantId = headerParticipantId || (session?.meetingCode === normalizedCode ? session.participantId : "");

  if (!actorParticipantId) {
    return NextResponse.json({ message: "Join this meeting from lobby first." }, { status: 403 });
  }

  const result = await setAttendanceThreshold(normalizedCode, actorParticipantId, Number(payload.thresholdPercent));
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status ?? 400 });
  }

  return NextResponse.json({ attendance: result.attendance });
}
