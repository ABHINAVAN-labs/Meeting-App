import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/meetings/constants";
import { applyMeetingWhiteboardAction, getMeetingWhiteboard } from "../../../../../lib/meetings/service";
import { parseSessionCookie } from "../../../../../lib/meetings/session";
import type { WhiteboardAction } from "../../../../../lib/meetings/types";
import { normalizeMeetingCode } from "../../../../../lib/meetings/validation";

const MAX_WHITEBOARD_CONTENT_LENGTH_BYTES = 200_000;

function resolveParticipantId(request: Request, normalizedCode: string) {
  return cookies().then(async (cookieStore) => {
    const session = await parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value, request);
    const headerParticipantId = request.headers.get("x-participant-id")?.trim() ?? "";
    return headerParticipantId || (session?.meetingCode === normalizedCode ? session.participantId : "");
  });
}

export async function GET(request: Request, context: { params: Promise<{ meetingCode: string }> }) {
  const { meetingCode } = await context.params;
  const normalizedCode = normalizeMeetingCode(meetingCode);
  if (!normalizedCode) {
    return NextResponse.json({ message: "Invalid meeting code." }, { status: 400 });
  }

  const participantId = await resolveParticipantId(request, normalizedCode);
  if (!participantId) {
    return NextResponse.json({ message: "Unauthorized for this meeting." }, { status: 403 });
  }

  const result = await getMeetingWhiteboard(normalizedCode, participantId);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 403 });
  }

  return NextResponse.json({ whiteboard: result.whiteboard });
}

export async function POST(request: Request, context: { params: Promise<{ meetingCode: string }> }) {
  const { meetingCode } = await context.params;
  const normalizedCode = normalizeMeetingCode(meetingCode);
  if (!normalizedCode) {
    return NextResponse.json({ message: "Invalid meeting code." }, { status: 400 });
  }

  const participantId = await resolveParticipantId(request, normalizedCode);
  if (!participantId) {
    return NextResponse.json({ message: "Unauthorized for this meeting." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_WHITEBOARD_CONTENT_LENGTH_BYTES) {
    return NextResponse.json({ message: "Whiteboard payload too large." }, { status: 413 });
  }

  const payload = (await request.json().catch(() => null)) as WhiteboardAction | null;
  if (!payload) {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const result = await applyMeetingWhiteboardAction(normalizedCode, participantId, payload);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status ?? 400 });
  }

  return NextResponse.json({ whiteboard: result.whiteboard });
}


