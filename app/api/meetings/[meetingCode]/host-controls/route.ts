import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/meetings/constants";
import { updateRoomHostControls } from "../../../../../lib/meetings/service";
import { parseSessionCookie } from "../../../../../lib/meetings/session";
import { normalizeMeetingCode } from "../../../../../lib/meetings/validation";

type HostControlsPayload = {
  muteAll?: boolean;
  forceStudentCamerasOn?: boolean;
  vivaTimeEnabled?: boolean;
  meetingChatEnabled?: boolean;
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

  const payload = (await request.json()) as Partial<HostControlsPayload>;
  const result = await updateRoomHostControls(normalizedCode, participantId, {
    muteAll: Boolean(payload.muteAll),
    forceStudentCamerasOn:
      typeof payload.forceStudentCamerasOn === "boolean" ? payload.forceStudentCamerasOn : undefined,
    vivaTimeEnabled: typeof payload.vivaTimeEnabled === "boolean" ? payload.vivaTimeEnabled : undefined,
    meetingChatEnabled: typeof payload.meetingChatEnabled === "boolean" ? payload.meetingChatEnabled : undefined
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ hostControls: result.hostControls });
}


