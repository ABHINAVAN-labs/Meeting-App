import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { joinMeeting } from "../../../../lib/meetings/service";
import { SESSION_COOKIE_NAME } from "../../../../lib/meetings/constants";
import type { JoinMeetingRequest } from "../../../../lib/meetings/types";

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<JoinMeetingRequest>;

  const result = joinMeeting({
    meetingCode: payload.meetingCode ?? "",
    displayName: payload.displayName ?? "",
    role: payload.role === "teacher" ? "teacher" : "student"
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: JSON.stringify({ meetingCode: result.meetingCode, participantId: result.participant.id }),
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  return NextResponse.json({
    meetingCode: result.meetingCode,
    participant: result.participant
  });
}
