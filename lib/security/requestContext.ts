import { createHash } from "crypto";

function normalizeIpAddress(rawIp: string): string {
  const first = rawIp.split(",")[0]?.trim() ?? "";
  if (first.startsWith("::ffff:")) {
    return first.slice(7);
  }
  return first;
}

function ipv4Prefix(ip: string): string {
  const segments = ip.split(".");
  if (segments.length !== 4) {
    return "0.0.0.0/24";
  }
  return `${segments[0]}.${segments[1]}.${segments[2]}.0/24`;
}

function expandIpv6(ip: string): string[] {
  if (!ip.includes("::")) {
    return ip.split(":");
  }
  const [left, right] = ip.split("::");
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const missing = 8 - (leftParts.length + rightParts.length);
  return [...leftParts, ...Array(Math.max(missing, 0)).fill("0"), ...rightParts];
}

function ipv6Prefix(ip: string): string {
  const groups = expandIpv6(ip)
    .map((group) => group || "0")
    .slice(0, 3);
  while (groups.length < 3) {
    groups.push("0");
  }
  return `${groups.join(":")}::/48`;
}

export function deriveIpPrefix(request: Request): string {
  const forwardedFor =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "";
  const ip = normalizeIpAddress(forwardedFor);
  if (!ip) {
    return "0.0.0.0/24";
  }
  if (ip.includes(":")) {
    return ipv6Prefix(ip.toLowerCase());
  }
  return ipv4Prefix(ip);
}

export function hashUserAgent(request: Request): string {
  const userAgent = request.headers.get("user-agent") ?? "";
  return createHash("sha256").update(userAgent).digest("hex");
}
