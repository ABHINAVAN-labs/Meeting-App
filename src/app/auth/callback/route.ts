import { NextResponse } from "next/server";
import { hasUserChosenName } from "@/lib/userProfile";
import { createClient } from "@/utils/supabase/server";
import {
  clearServerSupabaseAuthCookies,
  isInvalidRefreshTokenError,
} from "@/lib/supabaseAuth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/dashboard";

  if (!next.startsWith("/")) {
    next = "/dashboard";
  }

  if (code) {
    try {
      const supabase = await createClient();
      const {
        data: { session },
        error,
      } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        const user = session?.user;

        if (user && !hasUserChosenName(user)) {
          next = "/onboarding";
        }

        return NextResponse.redirect(`${origin}${next}`);
      }
    } catch (error) {
      if (!isInvalidRefreshTokenError(error)) {
        throw error;
      }

      await clearServerSupabaseAuthCookies();
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=oauth_failed`);
}
