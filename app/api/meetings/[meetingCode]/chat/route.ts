import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/meetings/constants";
import { sendMeetingChatMessage } from "../../../../../lib/meetings/service";
import { parseSessionCookie } from "../../../../../lib/meetings/session";
import { normalizeMeetingCode } from "../../../../../lib/meetings/validation";

type ChatPayload = {
  content: string;
};

export async function POST(request: Request, context: { params: Promise<{ meetingCode: string }> }) {
  const { meetingCode } = await context.params;
  const normalizedCode = normalizeMeetingCode(meetingCode);

  if (!normalizedCode) {
    return NextResponse.json({ message: "Invalid meeting code." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const session = await parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value, request);
  const headerParticipantId = request.headers.get("x-participant-id")?.trim() ?? "";
  const participantId = headerParticipantId || (session?.meetingCode === normalizedCode ? session.participantId : "");
  if (!participantId) {
    return NextResponse.json({ message: "Unauthorized for this meeting." }, { status: 403 });
  }

  const payload = (await request.json()) as Partial<ChatPayload>;
  const result = await sendMeetingChatMessage(normalizedCode, participantId, payload.content ?? "");

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ message: result.message });
}


