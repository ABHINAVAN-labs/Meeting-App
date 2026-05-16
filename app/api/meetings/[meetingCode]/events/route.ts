import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "../../../../../lib/meetings/constants";
import { listRoomParticipants } from "../../../../../lib/meetings/service";
import { parseSessionCookie } from "../../../../../lib/meetings/session";
import { subscribeToRoom } from "../../../../../lib/meetings/store";
import type { MeetingEvent } from "../../../../../lib/meetings/types";
import { normalizeMeetingCode } from "../../../../../lib/meetings/validation";

function encodeEvent(event: MeetingEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request, context: { params: Promise<{ meetingCode: string }> }) {
  const { meetingCode } = await context.params;
  const normalizedCode = normalizeMeetingCode(meetingCode);

  if (!normalizedCode) {
    return new Response("Invalid meeting code.", { status: 400 });
  }

  const cookieStore = await cookies();
  const session = await parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value, request);

  if (!session || session.meetingCode !== normalizedCode) {
    return new Response("Join this meeting from lobby first.", { status: 403 });
  }

  const initialParticipants = await listRoomParticipants(normalizedCode, session.participantId);

  let unsubscribe: (() => void) | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const snapshot: MeetingEvent = {
        type: "snapshot",
        participants: initialParticipants,
        sessionParticipantId: session.participantId
      };

      controller.enqueue(encoder.encode("retry: 2000\n\n"));
      controller.enqueue(encoder.encode(encodeEvent(snapshot)));

      unsubscribe = subscribeToRoom(normalizedCode, (event) => {
        if (event.type === "signal" && event.toParticipantId !== session.participantId) {
          return;
        }
        if (event.type === "participant-media-control" && event.participantId !== session.participantId) {
          return;
        }

        controller.enqueue(encoder.encode(encodeEvent(event)));
      });

      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15000);
    },
    cancel() {
      if (keepAlive) {
        clearInterval(keepAlive);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}


