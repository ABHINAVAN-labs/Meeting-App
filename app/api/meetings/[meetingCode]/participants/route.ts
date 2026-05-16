import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/meetings/constants";
import {
  getMeetingWhiteboard,
  getRoomHostControls,
  isParticipantSessionBanned,
  getRoomAttendanceState,
  listRoomParticipants,
  listVisibleMeetingChatMessages
} from "../../../../../lib/meetings/service";
import { parseSessionCookie } from "../../../../../lib/meetings/session";
import { normalizeMeetingCode } from "../../../../../lib/meetings/validation";
import { buildMeetingBanCookieSetPayload } from "../../../../../lib/security/banCookie";
import { getMeetingRegistryRecord } from "../../../../../lib/security/meetingRegistry";

export async function GET(
  request: Request,
  context: { params: Promise<{ meetingCode: string }> }
) {
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
    return NextResponse.json({ message: "Join this meeting from lobby first." }, { status: 403 });
  }
  if (await isParticipantSessionBanned(normalizedCode, participantId)) {
    const meetingRecord = getMeetingRegistryRecord(normalizedCode);
    if (meetingRecord) {
      const banCookie = buildMeetingBanCookieSetPayload(normalizedCode, meetingRecord.expires_at);
      cookieStore.set({
        name: banCookie.name,
        value: banCookie.value,
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: banCookie.maxAge
      });
    }
    return NextResponse.json({ message: "Unauthorized for this meeting." }, { status: 403 });
  }

  const participants = await listRoomParticipants(normalizedCode, participantId);
  const sessionParticipant = participants.find((participant) => participant.id === participantId) ?? null;
  const pendingParticipants = participants.filter((participant) => participant.status === "pending");
  const whiteboardResult =
    sessionParticipant?.role === "teacher" ? await getMeetingWhiteboard(normalizedCode, participantId) : null;
  const attendance = await getRoomAttendanceState(normalizedCode);

  return NextResponse.json({
    participants,
    pendingParticipants,
    sessionParticipant,
    hostControls: await getRoomHostControls(normalizedCode),
    meetingChatMessages: await listVisibleMeetingChatMessages(normalizedCode, participantId),
    attendance,
    whiteboard: whiteboardResult?.ok ? whiteboardResult.whiteboard : null,
    sessionParticipantId: participantId
  });
}


