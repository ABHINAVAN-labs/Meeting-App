import { NextResponse } from "next/server";
import { createLiveKitToken, getLiveKitUrl } from "../../../../lib/realtime/livekit";

export async function GET() {
  const url = getLiveKitUrl();
  const hasKey = Boolean(process.env.LIVEKIT_API_KEY);
  const hasSecret = Boolean(process.env.LIVEKIT_API_SECRET);

  const checks = {
    hasUrl: Boolean(url),
    urlStartsWithWs: url.startsWith("wss://") || url.startsWith("ws://"),
    hasKey,
    hasSecret
  };

  let tokenOk = false;
  let tokenError = "";

  try {
    createLiveKitToken({
      meetingCode: "debug-room",
      participantId: "debug-participant",
      participantName: "Debug Participant",
      role: "student"
    });
    tokenOk = true;
  } catch (error) {
    tokenError = error instanceof Error ? error.message : "Unknown token creation error";
  }

  return NextResponse.json({
    checks,
    tokenOk,
    tokenError,
    livekitUrl: url,
    advice: tokenOk
      ? "Server-side token generation works. If room still fails with 1006, issue is likely URL/project mismatch or network/firewall blocking websocket."
      : "Fix env values first."
  });
}
