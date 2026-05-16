import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";
import { REJOIN_TOKEN_TTL_SECONDS } from "../meetings/constants";
import type { ParticipantRole } from "../meetings/types";
import { getSecurityEnv } from "./env";

type NonceState = {
  participantId: string;
  expiresAt: number;
};

const activeNonces = new Map<string, NonceState>();

let signingKeyPromise: Promise<CryptoKey> | null = null;
let verificationKeyPromise: Promise<CryptoKey> | null = null;

export type RejoinTokenClaims = {
  participant_id: string;
  meeting_code: string;
  role: ParticipantRole;
  issued_at: number;
  expires_at: number;
  nonce: string;
  ua_hash: string;
  ip_prefix: string;
};

function getSigningKey(): Promise<CryptoKey> {
  if (signingKeyPromise) {
    return signingKeyPromise;
  }
  const { rejoinPrivateKeyPem } = getSecurityEnv();
  signingKeyPromise = importPKCS8(rejoinPrivateKeyPem, "ES256");
  return signingKeyPromise;
}

function getVerificationKey(): Promise<CryptoKey> {
  if (verificationKeyPromise) {
    return verificationKeyPromise;
  }
  const { rejoinPublicKeyPem } = getSecurityEnv();
  verificationKeyPromise = importSPKI(rejoinPublicKeyPem, "ES256");
  return verificationKeyPromise;
}

function hashForCompare(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = hashForCompare(a);
  const right = hashForCompare(b);
  return timingSafeEqual(left, right);
}

function purgeExpiredNonces(referenceTs = Date.now()): void {
  for (const [nonce, state] of activeNonces.entries()) {
    if (state.expiresAt <= referenceTs) {
      activeNonces.delete(nonce);
    }
  }
}

export function createRejoinNonce(): string {
  return randomBytes(16).toString("hex");
}

export function registerRejoinNonce(participantId: string, nonce: string, expiresAtUnix: number): void {
  purgeExpiredNonces();
  activeNonces.set(nonce, { participantId, expiresAt: expiresAtUnix * 1000 });
}

export function invalidateRejoinNonce(nonce: string | null | undefined): void {
  if (!nonce) {
    return;
  }
  activeNonces.delete(nonce);
}

export async function issueRejoinToken(input: {
  participantId: string;
  meetingCode: string;
  role: ParticipantRole;
  uaHash: string;
  ipPrefix: string;
  nonce?: string;
}): Promise<{ token: string; claims: RejoinTokenClaims }> {
  const nowUnix = Math.floor(Date.now() / 1000);
  const expiresAtUnix = nowUnix + REJOIN_TOKEN_TTL_SECONDS;
  const nonce = input.nonce ?? createRejoinNonce();

  const claims: RejoinTokenClaims = {
    participant_id: input.participantId,
    meeting_code: input.meetingCode,
    role: input.role,
    issued_at: nowUnix,
    expires_at: expiresAtUnix,
    nonce,
    ua_hash: input.uaHash,
    ip_prefix: input.ipPrefix
  };

  const signingKey = await getSigningKey();
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setIssuedAt(nowUnix)
    .setExpirationTime(expiresAtUnix)
    .sign(signingKey);

  registerRejoinNonce(input.participantId, nonce, expiresAtUnix);

  return { token, claims };
}

async function verifyToken(token: string, options?: { currentDate?: Date }): Promise<RejoinTokenClaims> {
  const verificationKey = await getVerificationKey();
  const { payload } = await jwtVerify(token, verificationKey, {
    algorithms: ["ES256"],
    currentDate: options?.currentDate
  });

  return payload as unknown as RejoinTokenClaims;
}

function assertBoundContext(claims: RejoinTokenClaims, uaHash: string, ipPrefix: string): boolean {
  return constantTimeEquals(claims.ua_hash, uaHash) && constantTimeEquals(claims.ip_prefix, ipPrefix);
}

export async function validateRejoinTokenForRequest(
  token: string,
  context: { uaHash: string; ipPrefix: string; currentDate?: Date }
) {
  try {
    const claims = await verifyToken(token, { currentDate: context.currentDate });
    if (!assertBoundContext(claims, context.uaHash, context.ipPrefix)) {
      return { ok: false as const };
    }

    const nonceState = activeNonces.get(claims.nonce);
    if (!nonceState || nonceState.participantId !== claims.participant_id) {
      return { ok: false as const };
    }

    return { ok: true as const, claims };
  } catch {
    return { ok: false as const };
  }
}

export async function redeemRejoinToken(token: string, context: { uaHash: string; ipPrefix: string; currentDate?: Date }) {
  const validated = await validateRejoinTokenForRequest(token, context);
  if (!validated.ok) {
    return { ok: false as const };
  }

  activeNonces.delete(validated.claims.nonce);
  return { ok: true as const, claims: validated.claims };
}
