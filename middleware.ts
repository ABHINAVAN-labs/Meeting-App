import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'",
  "Referrer-Policy": "no-referrer"
};

function resolveAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function isLocalHost(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

export function middleware(request: NextRequest) {
  const allowedOrigins = resolveAllowedOrigins();
  const origin = request.headers.get("origin");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "";
  const host = request.headers.get("host") ?? "";
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (isApi && !isLocalHost(host) && forwardedProto && forwardedProto !== "https") {
    return applySecurityHeaders(
      NextResponse.json({ error: "join_failed", code: "https_required" }, { status: 400 })
    );
  }

  if (isApi && origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
    return applySecurityHeaders(
      NextResponse.json({ error: "join_failed", code: "origin_not_allowed" }, { status: 403 })
    );
  }

  if (request.method === "OPTIONS" && isApi) {
    const response = new NextResponse(null, { status: 204 });
    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    }
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type,x-participant-id");
    response.headers.set("Access-Control-Max-Age", "600");
    return applySecurityHeaders(response);
  }

  const response = NextResponse.next();
  if (isApi && origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: ["/api/:path*"]
};
