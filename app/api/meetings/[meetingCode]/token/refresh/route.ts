import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../../lib/meetings/constants";
import { parseSessionCookie } from "../../../../../../lib/meetings/session";
import { isParticipantSessionBanned, listRoomParticipants } from "../../../../../../lib/meetings/service";
import { normalizeMeetingCode } from "../../../../../../lib/meetings/validation";
import { createLiveKitToken, getLiveKitUrl, LIVEKIT_TOKEN_TTL_SECONDS } from "../../../../../../lib/realtime/livekit";
import { buildMeetingBanCookieSetPayload } from "../../../../../../lib/security/banCookie";
import { getMeetingRegistryRecord } from "../../../../../../lib/security/meetingRegistry";

export async function POST(request: Request, context: { params: Promise<{ meetingCode: string }> }) {
  const { meetingCode } = await context.params;
  const normalizedCode = normalizeMeetingCode(meetingCode);

  if (!normalizedCode) {
    return NextResponse.json({ message: "Invalid meeting code." }, { status: 400 });
  }

  const headerParticipantId = request.headers.get("x-participant-id")?.trim() ?? "";
  const cookieStore = await cookies();
  const session = await parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value, request);
  const participants = await listRoomParticipants(normalizedCode, headerParticipantId || session?.participantId);

  const participantId = headerParticipantId || (session?.meetingCode === normalizedCode ? session.participantId : "");
  if (participantId && (await isParticipantSessionBanned(normalizedCode, participantId))) {
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
    return NextResponse.json({ message: "Join this meeting from lobby first." }, { status: 403 });
  }
  const current = participants.find((participant) => participant.id === participantId);
  if (!current) {
    return NextResponse.json({ message: "Join this meeting from lobby first." }, { status: 403 });
  }
  if (current.status !== "active") {
    return NextResponse.json({ message: "Waiting for teacher approval." }, { status: 403 });
  }

  const livekitUrl = getLiveKitUrl();
  if (!livekitUrl) {
    return NextResponse.json({ message: "LiveKit URL is not configured." }, { status: 500 });
  }

  try {
    const token = await createLiveKitToken({
      meetingCode: normalizedCode,
      participantId: current.id,
      participantName: current.displayName,
      role: current.role
    });

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


