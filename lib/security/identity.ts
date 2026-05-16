import { createHmac } from "crypto";
import { uuidv7 } from "uuidv7";
import { getSecurityEnv } from "./env";
import type { ParticipantRole } from "../meetings/types";

const NULL_BYTE = "\x00";

export type GeneratedIdentity = {
  participantId: string;
  uuidNonce: string;
};

export function generateParticipantIdentity(
  meetingCode: string,
  role: ParticipantRole,
  displayName: string
): GeneratedIdentity {
  const { serverSecret } = getSecurityEnv();
  const uuidNonce = uuidv7();
  const canonical = [meetingCode, role, displayName, uuidNonce].join(NULL_BYTE);
  const hmacHex = createHmac("sha256", Buffer.from(serverSecret, "hex")).update(canonical, "utf8").digest("hex");
  const truncated = hmacHex.slice(0, 32);
  const participantId = `${truncated}-${uuidNonce}`;

  return {
    participantId,
    uuidNonce
  };
}
