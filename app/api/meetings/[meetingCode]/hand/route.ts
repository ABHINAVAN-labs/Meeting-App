import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/meetings/constants";
import { parseSessionCookie } from "../../../../../lib/meetings/session";
import { setParticipantHandRaised } from "../../../../../lib/meetings/service";
import { normalizeMeetingCode } from "../../../../../lib/meetings/validation";

type HandPayload = {
  handRaised: boolean;
};

export async function POST(request: Request, context: { params: Promise<{ meetingCode: string }> }) {
  const { meetingCode } = await context.params;
  const normalizedCode = normalizeMeetingCode(meetingCode);

  if (!normalizedCode) {
    return NextResponse.json({ message: "Invalid meeting code." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  const headerParticipantId = request.headers.get("x-participant-id")?.trim() ?? "";
  const actorParticipantId = headerParticipantId || (session?.meetingCode === normalizedCode ? session.participantId : "");
  if (!actorParticipantId) {
    return NextResponse.json({ message: "Unauthorized for this meeting." }, { status: 403 });
  }

  const payload = (await request.json()) as Partial<HandPayload>;
  if (typeof payload.handRaised !== "boolean") {
    return NextResponse.json({ message: "handRaised must be boolean." }, { status: 400 });
  }

  const result = setParticipantHandRaised(normalizedCode, actorParticipantId, payload.handRaised);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
