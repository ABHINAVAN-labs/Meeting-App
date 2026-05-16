import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/meetings/constants";
import { sendSignal } from "../../../../../lib/meetings/service";
import { parseSessionCookie } from "../../../../../lib/meetings/session";
import { normalizeMeetingCode } from "../../../../../lib/meetings/validation";

type SignalPayload = {
  toParticipantId: string;
  signalType: "offer" | "answer" | "ice-candidate";
  signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

export async function POST(request: Request, context: { params: Promise<{ meetingCode: string }> }) {
  const { meetingCode } = await context.params;
  const normalizedCode = normalizeMeetingCode(meetingCode);

  if (!normalizedCode) {
    return NextResponse.json({ message: "Invalid meeting code." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const session = await parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value, request);
  if (!session || session.meetingCode !== normalizedCode) {
    return NextResponse.json({ message: "Unauthorized for this meeting." }, { status: 403 });
  }

  const payload = (await request.json()) as Partial<SignalPayload>;
  if (!payload.toParticipantId || !payload.signalType || !payload.signal) {
    return NextResponse.json({ message: "Invalid signal payload." }, { status: 400 });
  }

  sendSignal(normalizedCode, session.participantId, payload.toParticipantId, payload.signalType, payload.signal);
  return NextResponse.json({ ok: true });
}


