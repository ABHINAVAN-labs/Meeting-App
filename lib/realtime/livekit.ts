import { AccessToken, TrackSource } from "livekit-server-sdk";
export const LIVEKIT_TOKEN_TTL_SECONDS = 5 * 60;
const LIVEKIT_TOKEN_TTL = "5m";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function createLiveKitToken(params: {
  meetingCode: string;
  participantId: string;
  participantName: string;
  role: "student" | "teacher";
}) {
  const apiKey = requireEnv("LIVEKIT_API_KEY");
  const apiSecret = requireEnv("LIVEKIT_API_SECRET");

  const token = new AccessToken(apiKey, apiSecret, {
    identity: params.participantId,
    name: params.participantName,
    metadata: JSON.stringify({ role: params.role }),
    ttl: LIVEKIT_TOKEN_TTL
  });
  token.ttl = LIVEKIT_TOKEN_TTL;

  const isTeacher = params.role === "teacher";
  token.addGrant({
    roomJoin: true,
    room: params.meetingCode,
    canPublish: true,
    canSubscribe: true,
    canPublishSources: isTeacher
      ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : [TrackSource.CAMERA, TrackSource.MICROPHONE],
    canPublishData: isTeacher,
    canUpdateOwnMetadata: isTeacher,
    roomAdmin: isTeacher
  });

  const jwt = await token.toJwt();
  if (typeof jwt !== "string" || !jwt.includes(".")) {
    throw new Error("LiveKit JWT generation failed.");
  }

  return jwt;
}

export function getLiveKitUrl() {
  const raw = (process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "").trim();

  if (!raw) {
    return "";
  }

  if (raw.startsWith("https://")) {
    return raw.replace("https://", "wss://");
  }

  if (raw.startsWith("http://")) {
    return raw.replace("http://", "ws://");
  }

  return raw;
}
