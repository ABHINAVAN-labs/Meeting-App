import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Optional: keep homepage public
  if (
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);

  if (!user) {
    const signInUrl = new URL("/sign-in", request.url);

    const callbackUrl =
      request.nextUrl.pathname + request.nextUrl.search;

    signInUrl.searchParams.set("redirect_url", callbackUrl);

    return NextResponse.redirect(signInUrl);
  }

  return response ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|favicon.ico|.*\\..*|sign-in|sign-up|sign-out|reset-password|auth/callback|api/auth).*)",
  ],
};
