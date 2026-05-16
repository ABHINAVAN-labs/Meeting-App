import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/meetings/constants";
import { parseSessionCookie } from "../../../../../lib/meetings/session";
import { getRoomAttendanceState, listRoomParticipants } from "../../../../../lib/meetings/service";
import { normalizeMeetingCode } from "../../../../../lib/meetings/validation";
import { createLiveKitToken, getLiveKitUrl, LIVEKIT_TOKEN_TTL_SECONDS } from "../../../../../lib/realtime/livekit";

export async function POST(request: Request, context: { params: Promise<{ meetingCode: string }> }) {
  const { meetingCode } = await context.params;
  const normalizedCode = normalizeMeetingCode(meetingCode);

  if (!normalizedCode) {
    return NextResponse.json({ message: "Invalid meeting code." }, { status: 400 });
  }

  const headerParticipantId = request.headers.get("x-participant-id")?.trim() ?? "";

  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  const participants = await listRoomParticipants(normalizedCode, headerParticipantId || session?.participantId);

  const participantId = headerParticipantId || (session?.meetingCode === normalizedCode ? session.participantId : "");
  const current = participants.find((participant) => participant.id === participantId);

  if (!current) {
    return NextResponse.json({ message: "Join this meeting from lobby first." }, { status: 403 });
  }
  if (current.status !== "active") {
    return NextResponse.json({ message: "Waiting for teacher approval." }, { status: 403 });
  }
  const attendance = await getRoomAttendanceState(normalizedCode);
  if (attendance.endedAt) {
    return NextResponse.json({ message: "This meeting has ended." }, { status: 403 });
  }

  const livekitUrl = getLiveKitUrl();
  if (!livekitUrl) {
    return NextResponse.json({ message: "LiveKit URL is not configured." }, { status: 500 });
  }

  try {
    const isTeacher = current.role === "teacher";
    const token = await createLiveKitToken({
      meetingCode: normalizedCode,
      participantId: current.id,
      participantName: current.displayName,
      role: current.role
    });

    if (process.env.NODE_ENV !== "production") {
      console.info("[livekit-policy]", {
        meetingCode: normalizedCode,
        participantId: current.id,
        role: current.role,
        canPublishData: isTeacher,
        roomAdmin: isTeacher,
        canPublishSources: isTeacher
          ? ["camera", "microphone", "screen_share", "screen_share_audio"]
          : ["camera", "microphone"]
      });
    }

    return NextResponse.json({
      token,
      url: livekitUrl,
      participantId: current.id,
      role: current.role,
      expiresInSeconds: LIVEKIT_TOKEN_TTL_SECONDS
    });
  } catch {
    return NextResponse.json({ message: "LiveKit credentials are not configured." }, { status: 500 });
  }
}
