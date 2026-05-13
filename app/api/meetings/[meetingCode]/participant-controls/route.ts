import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/meetings/constants";
import { controlParticipantMedia } from "../../../../../lib/meetings/service";
import { parseSessionCookie } from "../../../../../lib/meetings/session";
import { normalizeMeetingCode } from "../../../../../lib/meetings/validation";

type ParticipantControlsPayload = {
  participantId: string;
  media: "camera" | "mic";
  enabled: boolean;
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

  const payload = (await request.json()) as Partial<ParticipantControlsPayload>;
  const participantId = payload.participantId?.trim() ?? "";
  const media = payload.media === "camera" || payload.media === "mic" ? payload.media : null;
  if (!participantId || !media || typeof payload.enabled !== "boolean") {
    return NextResponse.json({ message: "Invalid participant media payload." }, { status: 400 });
  }

  const result = controlParticipantMedia(normalizedCode, actorParticipantId, participantId, media, payload.enabled);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
