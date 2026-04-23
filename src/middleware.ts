import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Allow access to home page
  if (request.nextUrl.pathname === "/") {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);

  // If user is not authenticated, redirect to sign-in
  if (!user) {
    const signInUrl = new URL("/sign-in", request.url);
    
    // Preserve the requested path for redirect after sign-in
    const callbackUrl = request.nextUrl.pathname;
    signInUrl.searchParams.set("redirect_url", callbackUrl);
    
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sign-in, sign-up, sign-out (auth pages)
     * - auth/callback (OAuth callback)
     * - any file (.*\\..*)
     */
    "/((?!_next/static|_next/image|favicon.ico|sign-in|sign-up|sign-out|auth/callback|.*\\..*$).*)",
  ],
};
