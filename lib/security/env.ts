type SecurityEnv = {
  serverSecret: string;
  rejoinPrivateKeyPem: string;
  rejoinPublicKeyPem: string;
  allowedOrigins: string[];
};

let cachedEnv: SecurityEnv | null = null;

function parsePem(rawValue: string | undefined): string {
  if (!rawValue) {
    return "";
  }
  return rawValue.replace(/\\n/g, "\n").trim();
}

export function getSecurityEnv(): SecurityEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const serverSecret = process.env.SERVER_SECRET?.trim() ?? "";
  if (!/^[0-9a-fA-F]{64,}$/.test(serverSecret)) {
    throw new Error("SERVER_SECRET must be a hex string with at least 64 characters.");
  }

  const rejoinPrivateKeyPem = parsePem(process.env.REJOIN_TOKEN_PRIVATE_KEY_PEM);
  const rejoinPublicKeyPem = parsePem(process.env.REJOIN_TOKEN_PUBLIC_KEY_PEM);
  if (!rejoinPrivateKeyPem || !rejoinPublicKeyPem) {
    throw new Error("REJOIN_TOKEN_PRIVATE_KEY_PEM and REJOIN_TOKEN_PUBLIC_KEY_PEM are required.");
  }

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  cachedEnv = {
    serverSecret,
    rejoinPrivateKeyPem,
    rejoinPublicKeyPem,
    allowedOrigins
  };

  return cachedEnv;
}
