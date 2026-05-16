import { createHash, createHmac, timingSafeEqual } from "crypto";
import { getSecurityEnv } from "./env";

const BAN_COOKIE_PREFIX = "meeting_ban_";
const BAN_COOKIE_VERSION = 1;

type BanCookiePayload = {
  v: number;
  mc: string;
  be: number;
};

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function constantTimeHexEquals(aHex: string, bHex: string): boolean {
  const left = Buffer.from(aHex, "hex");
  const right = Buffer.from(bHex, "hex");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function parseCookieHeader(cookieHeader: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part) {
      continue;
    }
    const idx = part.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    map.set(part.slice(0, idx), part.slice(idx + 1));
  }
  return map;
}

function signPayload(serializedPayload: string): string {
  const { serverSecret } = getSecurityEnv();
  return createHmac("sha256", Buffer.from(serverSecret, "hex")).update(serializedPayload, "utf8").digest("hex");
}

export function getMeetingBanCookieName(meetingCode: string): string {
  const suffix = createHash("sha256").update(meetingCode).digest("hex").slice(0, 16);
  return `${BAN_COOKIE_PREFIX}${suffix}`;
}

export function buildMeetingBanCookieValue(meetingCode: string, bannedUntilIso: string): string {
  const bannedUntilMs = Date.parse(bannedUntilIso);
  const payload: BanCookiePayload = {
    v: BAN_COOKIE_VERSION,
    mc: meetingCode,
    be: Number.isNaN(bannedUntilMs) ? Date.now() : bannedUntilMs
  };
  const payloadText = JSON.stringify(payload);
  const encoded = toBase64Url(payloadText);
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

function verifyMeetingBanCookieValue(cookieValue: string, meetingCode: string): { active: boolean; expired: boolean } {
  const [encoded, sig] = cookieValue.split(".");
  if (!encoded || !sig) {
    return { active: false, expired: false };
  }
  const expectedSig = signPayload(encoded);
  if (!constantTimeHexEquals(sig, expectedSig)) {
    return { active: false, expired: false };
  }

  const payloadText = fromBase64Url(encoded);
  if (!payloadText) {
    return { active: false, expired: false };
  }

  let payload: BanCookiePayload;
  try {
    payload = JSON.parse(payloadText) as BanCookiePayload;
  } catch {
    return { active: false, expired: false };
  }

  if (payload.v !== BAN_COOKIE_VERSION || payload.mc !== meetingCode || typeof payload.be !== "number") {
    return { active: false, expired: false };
  }

  const now = Date.now();
  if (payload.be <= now) {
    return { active: false, expired: true };
  }

  return { active: true, expired: false };
}

export function getMeetingBanStatusFromRequest(request: Request, meetingCode: string): {
  active: boolean;
  expired: boolean;
  cookieName: string;
} {
  const cookieName = getMeetingBanCookieName(meetingCode);
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = parseCookieHeader(cookieHeader);
  const value = cookies.get(cookieName);
  if (!value) {
    return { active: false, expired: false, cookieName };
  }

  const verified = verifyMeetingBanCookieValue(value, meetingCode);
  return {
    active: verified.active,
    expired: verified.expired,
    cookieName
  };
}

export function buildMeetingBanCookieSetPayload(meetingCode: string, bannedUntilIso: string): {
  name: string;
  value: string;
  maxAge: number;
} {
  const cookieName = getMeetingBanCookieName(meetingCode);
  const value = buildMeetingBanCookieValue(meetingCode, bannedUntilIso);
  const bannedUntilMs = Date.parse(bannedUntilIso);
  const maxAge = Math.max(1, Math.ceil((bannedUntilMs - Date.now()) / 1000));
  return {
    name: cookieName,
    value,
    maxAge
  };
}
